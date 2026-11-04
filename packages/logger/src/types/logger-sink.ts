import type { LogLevels } from './log-levels';

/**
 * A logging destination.
 *
 * This is the object a {@link SinkFactory} returns. The factory runs inside the
 * logger worker, so the sink closes over its own state (file handles, buffers, …)
 * instead of exposing it. All values the sink needs must be created **inside** the
 * factory body — it cannot close over module-scoped imports (use dynamic `import()`
 * or runtime globals such as `Bun` instead).
 */
export interface LoggerSink<TLogObject = unknown> {
	/**
	 * Logs a message with the sink's implementation.
	 *
	 * @param level - The log level at which the message should be logged.
	 * @param timestamp - The epoch timestamp (ms) at which the message was logged.
	 * @param object - The object to log.
	 *
	 * @returns A promise when the sink is asynchronous; it is awaited by {@link Logger.flush}.
	 */
	log(level: LogLevels, timestamp: number, object: TLogObject): Promise<void> | void;

	/**
	 * Optional fast path receiving the log as the JSON string the logger already produced
	 * (`undefined` when the logged value was `undefined`). When present, the worker calls it
	 * instead of {@link LoggerSink.log} and skips `JSON.parse`, so sinks that write JSON
	 * should implement it.
	 *
	 * @param level - The log level at which the message should be logged.
	 * @param timestamp - The epoch timestamp (ms) at which the message was logged.
	 * @param json - The logged object serialized with `JSON.stringify`.
	 */
	logJson?(level: LogLevels, timestamp: number, json: string | undefined): Promise<void> | void;

	/**
	 * Flushes any buffered data to the underlying destination.
	 * Called by {@link Logger.flush}; implement it when your sink buffers writes
	 * (e.g. a file writer) and durability on flush matters.
	 */
	flush?(): Promise<void> | void;

	/**
	 * Closes the sink and releases its resources.
	 * Called when the logger is closing. Optional - implement this if your sink needs
	 * cleanup (e.g. closing file handles, database connections).
	 */
	close?(): Promise<void> | void;
}
