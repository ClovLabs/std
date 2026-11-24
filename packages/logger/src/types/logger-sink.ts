import type { LogLevels } from './log-levels';

/**
 * A logging destination.
 *
 * This is the object a {@link SinkFactory} returns. The factory runs inside the
 * logger worker, so the sink closes over its own state (file handles, buffers, …)
 * instead of exposing it. All values the sink needs must be created **inside** the
 * factory body: it cannot close over module-scoped imports (use dynamic `import()`
 * or runtime globals such as `Bun` instead).
 */
export interface LoggerSink<TLogObject = unknown> {
	/**
	 * Writes one log entry.
	 *
	 * @param level - The log level at which the message should be logged.
	 * @param timestamp - Epoch time in milliseconds when the log was made.
	 * @param object - The logged value after a JSON round trip (a `Date` arrives as a string).
	 *
	 * @returns A promise when the sink is asynchronous; it is awaited by {@link Logger.flush} and on close.
	 */
	log: (level: LogLevels, timestamp: number, object: TLogObject) => Promise<void> | void;

	/**
	 * Optional fast path receiving the log as the JSON string the logger already produced
	 * (`undefined` when the logged value was `undefined`). When present, the worker calls it
	 * instead of {@link LoggerSink.log} and skips `JSON.parse`, so sinks that write JSON
	 * should implement it.
	 *
	 * @param level - The log level at which the message should be logged.
	 * @param timestamp - Epoch time in milliseconds when the log was made.
	 * @param json - The logged value serialized with `JSON.stringify`.
	 */
	logJson?: (
		level: LogLevels,
		timestamp: number,
		json: string | undefined
	) => Promise<void> | void;

	/**
	 * Flushes any buffered data to the underlying destination.
	 * Called by {@link Logger.flush} and before {@link LoggerSink.close}; implement it when your sink buffers writes
	 * (e.g. a file writer) and durability on flush matters.
	 */
	flush?: () => Promise<void> | void;

	/**
	 * Closes the sink and releases its resources.
	 * Called once when the logger closes, after {@link LoggerSink.flush}. Implement it when
	 * the sink holds something to release (file handles, database connections).
	 */
	close?: () => Promise<void> | void;
}
