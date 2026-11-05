import type { FileSink } from 'bun';

import type { LogLevels } from '../types/log-levels';
import type { LoggerSink } from '../types/logger-sink';

/**
 * Creates a sink that appends JSON log entries to a file.
 * Uses `Bun.FileSink` for efficient buffered appending (runs in the worker context).
 *
 * @typeParam TLogObject - The shape of the objects this sink accepts.
 * @param path - The destination file path.
 */
export const fileSink = <TLogObject = unknown>(path: string): LoggerSink<TLogObject> => {
	const sink: FileSink = Bun.file(path).writer();
	let isClosed = false;

	// Same output as `JSON.stringify({ timestamp, level, content })`, without re-serializing.
	const logJson = (level: LogLevels, timestamp: number, json: string | undefined): void => {
		if (isClosed) return;
		void sink.write(
			json === undefined
				? `{"timestamp":${timestamp},"level":"${level}"}\n`
				: `{"timestamp":${timestamp},"level":"${level}","content":${json}}\n`
		);
	};

	return {
		logJson,
		log(level: LogLevels, timestamp: number, object: TLogObject): void {
			logJson(level, timestamp, JSON.stringify(object));
		},
		async flush(): Promise<void> {
			if (isClosed) return;
			await sink.flush();
		},
		async close(): Promise<void> {
			if (isClosed) return;
			isClosed = true;
			await sink.end();
		}
	};
};
