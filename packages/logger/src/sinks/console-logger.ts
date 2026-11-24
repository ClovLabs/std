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

	/** Lines of `pendingLevel` not printed yet: one console call per batch costs far less than one per line */
	let pending = '';
	let pendingLevel: LogLevels = 'LOG';

	const writePending = (): void => {
		if (pending === '') return;
		methods[pendingLevel](pending);
		pending = '';
	};

	// Same output as `JSON.stringify({ timestamp, level, content })`, without re-serializing.
	const logJson = (level: LogLevels, timestamp: number, json: string | undefined): void => {
		// A batch holds a single level: each level has its own console method, and order must hold.
		if (level !== pendingLevel) {
			writePending();
			pendingLevel = level;
		}
		// Runs once the worker has handed over every log it had, so a line never waits for more.
		if (pending === '') queueMicrotask(writePending);
		else pending += '\n';
		pending +=
			json === undefined
				? `{"timestamp":${timestamp},"level":"${level}"}`
				: `{"timestamp":${timestamp},"level":"${level}","content":${json}}`;
		// A long drain does not yield to microtasks, so cap the batch too.
		if (pending.length >= 65_536) writePending();
	};

	return {
		logJson,
		log(level: LogLevels, timestamp: number, object: TLogObject): void {
			logJson(level, timestamp, JSON.stringify(object));
		},
		flush: writePending,
		close: writePending
	};
};
