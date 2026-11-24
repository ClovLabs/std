import type { FileSink } from 'bun';

import type { LogLevels } from '../types/log-levels';
import type { LoggerSink } from '../types/logger-sink';

/**
 * Creates a sink that writes JSON log entries to a file, one per line.
 * An existing file is appended to, a missing one is created. Writes go through a `Bun.FileSink` opened in the worker.
 *
 * @typeParam TLogObject - The shape of the objects this sink accepts.
 * @param path - The destination file path.
 */
export const fileSink = <TLogObject = unknown>(path: string): LoggerSink<TLogObject> => {
	// `Bun.file(path).writer()` truncates, so open the descriptor in append mode instead.
	const fs = process.getBuiltinModule('node:fs');
	const fd: number = fs.openSync(path, 'a');
	const sink: FileSink = Bun.file(fd).writer();
	let isClosed = false;
	/** Lines not handed to the writer yet: one `write` per batch costs far less than one per line */
	let pending = '';

	const writePending = (): void => {
		if (pending === '') return;
		void sink.write(pending);
		pending = '';
	};

	// Same output as `JSON.stringify({ timestamp, level, content })`, without re-serializing.
	const logJson = (level: LogLevels, timestamp: number, json: string | undefined): void => {
		if (isClosed) return;
		// Runs once the worker has handed over every log it had, so a line never waits for more.
		if (pending === '') queueMicrotask(writePending);
		pending +=
			json === undefined
				? `{"timestamp":${timestamp},"level":"${level}"}\n`
				: `{"timestamp":${timestamp},"level":"${level}","content":${json}}\n`;
		// Under a steady flow the worker never yields to microtasks, so cap the batch too.
		if (pending.length >= 65_536) writePending();
	};

	return {
		logJson,
		log(level: LogLevels, timestamp: number, object: TLogObject): void {
			logJson(level, timestamp, JSON.stringify(object));
		},
		async flush(): Promise<void> {
			if (isClosed) return;
			writePending();
			await sink.flush();
		},
		async close(): Promise<void> {
			if (isClosed) return;
			isClosed = true;
			writePending();
			await sink.end();
			// The writer does not close a descriptor it was handed.
			fs.closeSync(fd);
		}
	};
};
