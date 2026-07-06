import type { LogLevels } from '../types/log-levels';
import type { LoggerSink } from '../types/logger-sink';

/**
 * Creates a sink that writes JSON log entries to the console, routed to the
 * matching `console` method for each level (`error`, `warn`, `info`, …).
 *
 * @typeParam TLogObject - The shape of the objects this sink accepts.
 */
export const consoleSink = <TLogObject = unknown>(): LoggerSink<TLogObject> => ({
	log(level: LogLevels, timestamp: number, object: TLogObject): void {
		const logEntry = { timestamp, level, content: object };
		const logLevel: Lowercase<LogLevels> = level.toLowerCase() as Lowercase<LogLevels>;
		const methods: Record<Lowercase<LogLevels>, (msg: string) => void> = {
			error: console.error,
			warn: console.warn,
			info: console.info,
			debug: console.debug,
			log: console.log,
			trace: console.trace
		};
		methods[logLevel](JSON.stringify(logEntry));
	}
});
