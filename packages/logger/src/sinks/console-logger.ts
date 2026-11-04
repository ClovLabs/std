import type { LogLevels } from '../types/log-levels';
import type { LoggerSink } from '../types/logger-sink';

/**
 * Creates a sink that writes JSON log entries to the console, routed to the
 * matching `console` method for each level (`error`, `warn`, `info`, …).
 *
 * @typeParam TLogObject - The shape of the objects this sink accepts.
 */
export const consoleSink = <TLogObject = unknown>(): LoggerSink<TLogObject> => {
	const methods: Record<LogLevels, (msg: string) => void> = {
		ERROR: console.error,
		WARN: console.warn,
		INFO: console.info,
		DEBUG: console.debug,
		LOG: console.log
	};

	// Same output as `JSON.stringify({ timestamp, level, content })`, without re-serializing.
	const logJson = (level: LogLevels, timestamp: number, json: string | undefined): void => {
		methods[level](
			json === undefined
				? `{"timestamp":${timestamp},"level":"${level}"}`
				: `{"timestamp":${timestamp},"level":"${level}","content":${json}}`
		);
	};

	return {
		logJson,
		log(level: LogLevels, timestamp: number, object: TLogObject): void {
			logJson(level, timestamp, JSON.stringify(object));
		}
	};
};
