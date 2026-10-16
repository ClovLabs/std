<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/logger/logo-logger.png" alt="Clov Logger logo" width="200" />
</p>

# Clov Logger

A logger for Bun that does its writing in a worker thread, so logging doesn't hold up your main loop. Logs are batched, sent to one or more sinks (console, file, or your own), and typed: if a sink expects `{ userId, action }`, TypeScript makes you pass it.

```bash
bun add @clov-std/logger
```

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

Sinks are factory functions, not classes. Pass the factory itself to `registerSink`, not the result of calling it: the worker re-evaluates it and calls it with the args you gave, so the sink is built inside the worker.

## Several sinks

Register as many as you need, and target some of them per call:

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

| Factory       | Args   | Description                                             |
| ------------- | ------ | ------------------------------------------------------- |
| `consoleSink` | _none_ | Writes JSON log entries to `console` (routed by level). |
| `fileSink`    | `path` | Appends JSON log entries to a file via `Bun.FileSink`.  |
| `devNullSink` | _none_ | Discards everything. Handy for benchmarks.              |

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
	log(level: LogLevels, timestamp: number, object: TLogObject): Promise<void> | void;
	flush?(): Promise<void> | void; // called by Logger.flush()
	close?(): Promise<void> | void; // called on Logger.close()
}
```

Only `log` is required. Implement `flush` if your sink buffers writes, so `logger.flush()` pushes them through, and `close` to release file handles or connections.

## Typed logs

Give a sink a type and every call that reaches it has to match.

### One typed sink

```ts
import { Logger, type LoggerSink, type LogLevels, type SinkFactory } from '@clov-std/logger';

interface UserLog {
	userId: number;
	action: string;
	timestamp?: Date;
}

// Typed factory: the returned sink only accepts UserLog objects.
const userLogSink: SinkFactory<UserLog> = () => ({
	log(level: LogLevels, timestamp: number, object: UserLog): void {
		console.log(`User ${object.userId} performed: ${object.action}`);
	}
});

const logger = new Logger().registerSink('userLog', userLogSink);

// ✅ TypeScript requires the correct shape
logger.info({ userId: 123, action: 'login' });

// ❌ TypeScript error: Missing required property 'action'
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

// ✅ Logging to both sinks requires BOTH types combined
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

// ✅ Logging to only one sink requires only that sink's type
logger.warn({ userId: 456, action: 'failed_attempt' }, ['user']);

// ❌ TypeScript error: Missing api properties
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

// ✅ Only DatabaseLog is required, console accepts anything
logger.info({ query: 'SELECT * FROM users', duration: 123 }, ['database', 'console']);
```

## Errors

When a sink throws, or a factory fails to build inside the worker, the logger emits an event:

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

To make sure everything is written before shutting down:

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

`flush()` drains the in-memory queue and then each sink's own buffer, through the optional `flush()` on `LoggerSink`.

## Configuration

Batching and queue limits:

```ts
import { Logger, consoleSink } from '@clov-std/logger';

const logger = new Logger({
	maxPendingLogs: 10_000, // Max queued logs (default: 10,000)
	batchSize: 100, // Logs per batch (default: 100)
	batchTimeout: 0.1, // Ms before flushing a partial batch (default: 0.1)
	maxMessagesInFlight: 100, // Max batches being processed (default: 100)
	autoEnd: true, // Auto-close on process exit (default: true)
	flushOnBeforeExit: true // Flush before exit (default: true)
}).registerSink('console', consoleSink);
```

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
