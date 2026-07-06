import type { LoggerSink } from '../types/logger-sink';

/**
 * Creates a sink that discards all logs (like `/dev/null`).
 * Useful for benchmarking the logger overhead without I/O.
 *
 * @typeParam TLogObject - The shape of the objects this sink accepts.
 */
export const devNullSink = <TLogObject = unknown>(): LoggerSink<TLogObject> => ({
	log(): void {
		// Do nothing - discard the log
	}
});
