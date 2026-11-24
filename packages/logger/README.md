<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/logger/logo-logger.svg" alt="Clov Logger logo" width="200" />
</p>

# Clov Logger

A logger for Bun that does its writing in a worker thread, so logging doesn't hold up your main loop. Each log is serialized once, handed to the worker through shared memory, and written by one or more sinks (console, file, or your own). Logs are typed: if a sink expects `{ userId, action }`, TypeScript makes you pass it.

```bash
bun add @clov-std/logger @clov-std/error
```

`@clov-std/error` is a peer dependency.

## Basic setup

```ts
import { Logger, consoleSink } from '@clov-std/logger';

// Create a logger and register a console sink
const logger = new Logger().registerSink('console', consoleSink);

// Log messages (always pass an object)
logger.info({ message: 'Application started' });
logger.warn({ message: 'This is a warning' });
logger.error({ message: 'An error occurred', code: 500 });
logger.debug({ action: 'debug_info', data: { foo: 'bar' } });
logger.log({ event: 'generic_log' });

// Close the logger when done
await logger.close();
```

Sinks are factory functions, not classes. Pass the factory itself to `registerSink`, not the result of calling it: the sink is built inside the worker, which re-evaluates the factory and calls it with the arguments you gave.

## Several sinks

Register as many as you need, and pick which ones a call goes to:

```ts
import { Logger, consoleSink, fileSink } from '@clov-std/logger';

// Register multiple sinks
const logger = new Logger()
	.registerSink('console', consoleSink)
	.registerSink('file', fileSink, './app.log');

// Log to all sinks
logger.info({ message: 'This goes to console and file' });

// Log to specific sinks only
logger.error({ message: 'Only in file' }, ['file']);
logger.warn({ message: 'Only in console' }, ['console']);

await logger.close();
```

## Built-in sinks

| Factory       | Args   | Description                                                   |
| ------------- | ------ | ------------------------------------------------------------- |
| `consoleSink` | _none_ | Writes JSON log entries to `console` (routed by level).       |
| `fileSink`    | `path` | Appends JSON log entries to a file, creating it when missing. |
| `devNullSink` | _none_ | Discards everything. Handy for benchmarks.                    |

```ts
import { Logger, devNullSink, fileSink } from '@clov-std/logger';

const logger = new Logger()
	.registerSink('applog', fileSink, './app.log')
	.registerSink('silent', devNullSink);
```

## Custom sinks

A sink is a plain object implementing `LoggerSink`, returned by a factory. The factory is stringified and re-evaluated inside the worker, so its body has to be self-contained. It can use its arguments, runtime globals (`Bun`, `console`, `JSON`, ...) and dynamic `import()`, but not imports or variables from the module it's written in.

```ts
import { Logger, type SinkFactory } from '@clov-std/logger';

// A self-contained factory: no module-scoped imports captured.
const databaseSink: SinkFactory<{ query: string }, [dbUrl: string]> = (dbUrl: string) => {
	// Open the connection inside the factory, the worker owns it.
	const connection = /* …open using `dbUrl`… */ {} as unknown;
	return {
		async log(level, timestamp, object) {
			// object is typed as { query: string }
			await (connection as { write: (s: string) => Promise<void> }).write(
				JSON.stringify({ level, timestamp, object })
			);
		},
		async close() {
			await (connection as { close: () => Promise<void> }).close();
		}
	};
};

const logger = new Logger().registerSink('database', databaseSink, 'postgres://localhost/app');

logger.info({ query: 'SELECT 1' });
await logger.close();
```

### The `LoggerSink` interface

```ts
interface LoggerSink<TLogObject = unknown> {
	log: (level: LogLevels, timestamp: number, object: TLogObject) => Promise<void> | void;
	logJson?: (
		level: LogLevels,
		timestamp: number,
		json: string | undefined
	) => Promise<void> | void;
	flush?: () => Promise<void> | void; // called by Logger.flush(), and before close
	close?: () => Promise<void> | void; // called on Logger.close()
}
```

Only `log` is required. Logs reach the worker as JSON, so `log` receives the result of `JSON.parse`. A sink that writes JSON anyway can implement `logJson` to get the string as is: the worker then calls it instead of `log` and never parses the log. The built-in sinks all do. Implement `flush` if your sink buffers writes, so `logger.flush()` pushes them through, and `close` to release file handles or connections.

## Typed logs

Give a sink a type and every call that reaches it has to match.

### One typed sink

```ts
import { Logger, type LoggerSink, type LogLevels, type SinkFactory } from '@clov-std/logger';

interface UserLog {
	userId: number;
	action: string;
}

// Typed factory: the returned sink only accepts UserLog objects.
const userLogSink: SinkFactory<UserLog> = () => ({
	log(level: LogLevels, timestamp: number, object: UserLog): void {
		console.log(`User ${object.userId} performed: ${object.action}`);
	}
});

const logger = new Logger().registerSink('userLog', userLogSink);

// TypeScript requires the correct shape
logger.info({ userId: 123, action: 'login' });

// TypeScript error: missing required property 'action'
logger.info({ userId: 123 });
```

### Several typed sinks

When a call targets several sinks, the expected type is the intersection of theirs, so the object has to satisfy all of them.

```ts
interface UserLog {
	userId: number;
	action: string;
}

interface ApiLog {
	endpoint: string;
	method: string;
	statusCode: number;
}

const userLogSink: SinkFactory<UserLog> = () => ({
	async log(_level, _ts, object) {
		// … persist object …
		void object;
	}
});

const apiLogSink: SinkFactory<ApiLog> = () => ({
	async log(_level, _ts, object) {
		// … persist object …
		void object;
	}
});

const logger = new Logger().registerSink('user', userLogSink).registerSink('api', apiLogSink);

// Logging to both sinks requires both types combined
logger.info(
	{
		userId: 123,
		action: 'api_call',
		endpoint: '/users',
		method: 'POST',
		statusCode: 201
	},
	['user', 'api']
);

// Logging to one sink requires only that sink's type
logger.warn({ userId: 456, action: 'failed_attempt' }, ['user']);

// TypeScript error: missing ApiLog properties
logger.error({ userId: 789, action: 'error' }, ['user', 'api']);
```

### Typed and untyped together

Untyped sinks like `consoleSink` accept `unknown`, so they add no constraint of their own. A call that targets both only has to satisfy the typed one.

```ts
import { Logger, consoleSink, type SinkFactory } from '@clov-std/logger';

interface DatabaseLog {
	query: string;
	duration: number;
}

const databaseLogSink: SinkFactory<DatabaseLog> = () => ({
	async log(_level, _ts, object) {
		// … persist object …
		void object;
	}
});

const logger = new Logger()
	.registerSink('database', databaseLogSink)
	.registerSink('console', consoleSink); // accepts unknown

// Only DatabaseLog is required, console accepts anything
logger.info({ query: 'SELECT * FROM users', duration: 123 }, ['database', 'console']);
```

## Errors

Errors inside the worker don't throw at the call site. The logger emits `sinkError` when a sink fails to write or close, and `registerSinkError` when a factory fails to build:

```ts
import { Logger, consoleSink } from '@clov-std/logger';

const logger = new Logger().registerSink('console', consoleSink);

// Listen for sink errors (a sink throwing inside the worker)
logger.addListener('sinkError', (error) => {
	console.error('Logger error:', error.message);
});

// Listen for sink registration errors (factory failed to build inside the worker)
logger.addListener('registerSinkError', (error) => {
	console.error('Failed to register sink:', error.message);
});

logger.info({ message: 'Safe to log' });
await logger.close();
```

## Flushing and closing

```ts
import { Logger, consoleSink } from '@clov-std/logger';

const logger = new Logger().registerSink('console', consoleSink);

logger.info({ message: 'First message' });
logger.info({ message: 'Second message' });

// Wait for all pending logs to be processed
await logger.flush();

// Close the logger and release resources (internally calls flush)
await logger.close();
```

`flush()` waits until the worker has read everything already logged, then flushes each sink's own buffer through the optional `flush()` on `LoggerSink`.

## How it works

A log call serializes the object with `JSON.stringify` and copies the result into a ring buffer shared with the worker (`SharedArrayBuffer`). There is no message per log: the worker reads the buffer by itself. While logs keep coming it checks the buffer every millisecond, so a log call never has to wake it. After a few milliseconds without a log it goes to sleep, and the next log wakes it. The console and file sinks write all the logs the worker has just read in one call.

This has a few consequences:

- `log` receives what `JSON.parse` gives back and `logJson` the JSON string itself, so `Date` becomes a string, `Map`, `Set` and `Error` become `{}`, and a `BigInt` or a circular object makes the call throw `logger.log.serialization-failed`.
- When the buffer is full, the log call waits for the worker to catch up instead of dropping the log.
- A single log that takes half of the buffer or more throws `logger.log.too-large`.
- A log made after `close()` is dropped.
- A logger holds at most 32 sinks.

## Configuration

```ts
import { Logger, consoleSink } from '@clov-std/logger';

const logger = new Logger({
	bufferSize: 4 * 1024 * 1024, // Shared buffer size in bytes (default: 4 MiB)
	autoEnd: true // Flush and close when the event loop empties; process.exit() skips the flush (default: true)
}).registerSink('console', consoleSink);
```

## Benchmark

`bun run bench` compares Clov with pino, both writing the same object to a real file. pino runs without `pid` and `hostname` so both write comparable lines.

It measures a burst of logs, then one `info()` call in two situations: in a tight loop, and spaced 10 µs apart with the event loop running in between, which is how a server logs its requests. The two differ because a tight loop keeps the CPU caches warm and never lets the writer go idle.

Results on an Intel Core Ultra 7 155H with Bun 1.4.6:

| Logger                    | 10,000 logs to disk | One `info()` call, tight loop | One `info()` call, spaced |
| ------------------------- | ------------------- | ----------------------------- | ------------------------- |
| Clov (`fileSink`)         | 3.8 ms              | 337 ns                        | 293 ns                    |
| pino `transport` (worker) | 10.9 ms             | 954 ns                        | 1.25 µs                   |
| pino, sync destination    | 32.8 ms             | 2.08 µs                       | 1.01 µs                   |
| pino, async destination   | 34.6 ms             | 2.09 µs                       | 1.28 µs                   |

pino is measured under Bun here. It is built for Node and may do better there.

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
