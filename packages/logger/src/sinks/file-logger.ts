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

	return {
		log(level: LogLevels, timestamp: number, object: TLogObject): void {
			if (isClosed) return;
			void sink.write(JSON.stringify({ timestamp, level, content: object }) + '\n');
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
