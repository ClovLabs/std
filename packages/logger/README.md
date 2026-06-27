<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/Dominus-Web-Service/std@main/packages/logger/logo-logger.png" alt="DWS Logger logo" width="200" />
</p>

# 🎯 DWS Logger

Logging in Bun often means choosing between "fast but dumb" or "smart but blocking".
`@dws-std/logger` gives you both: a type-safe, sink-based system that never blocks your main thread.

## Why this package?

The goal is simple: **Stop your logs from slowing down your app.**

Most loggers either block on every write or lose type safety when you need structured logging.
This package runs everything in a worker thread, batches automatically, and still gives you full TypeScript inference on what you log.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Custom Sinks](#-custom-sinks)
- [Type-Safe Logging](#-type-safe-logging)
- [Error Handling](#-error-handling)
- [Flushing and Closing](#-flushing-and-closing)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- ⚡ **Zero Blocking** : Every log goes through a worker thread – your main loop stays fast.
- 🔒 **Type-Safe** : TypeScript infers the shape of your logs. No more `any` everywhere.
- 🎯 **Sink Pattern** : Route logs to console, file, database, or your own custom destination.
- 🔄 **Smart Batching** : Logs are grouped automatically for better I/O performance.
- 🔔 **Event-Driven** : Listen to flush, close, and error events when you need them.

## 🔧 Installation

```bash
bun add @dws-std/logger
```

> **Peer dependency:** `@dws-std/error` must be installed alongside.

## ⚙️ Usage

### Basic Setup

Create a logger, attach a sink, and start logging:

```ts
import { Logger, consoleSink } from '@dws-std/logger';

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

> ℹ️ Sinks are **factory functions**, not classes. You pass the factory itself (not the
> result of calling it) to `registerSink`. The worker re-evaluates the factory string
> and calls it with the `sinkArgs` you forwarded, so the sink is built **inside** the worker.

### Multiple Sinks

Need logs going to different places? Register as many sinks as you want:

```ts
import { Logger, consoleSink, fileSink } from '@dws-std/logger';

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

### Built-in Sinks

| Factory      | Args        | Description                                                |
| ------------ | ----------- | --------------------------------------------------------- |
| `consoleSink`| _none_      | Writes JSON log entries to `console` (routed by level).   |
| `fileSink`   | `path`      | Appends JSON log entries to a file via `Bun.FileSink`.    |
| `devNullSink`| _none_      | Discards everything – useful for benchmarks / dry runs.  |

```ts
import { Logger, devNullSink, fileSink } from '@dws-std/logger';

const logger = new Logger()
	.registerSink('applog', fileSink, './app.log')
	.registerSink('silent', devNullSink);
```

## 🛠️ Custom Sinks

A sink is a plain object implementing the `LoggerSink` interface — register a **factory**
function that builds and returns it. The factory is stringify-ed and re-evaluated inside the
worker, so its body must be **self-contained**: it may use its arguments, runtime globals
(`Bun`, `console`, `JSON`, …) and dynamic `import()`, but **must not** close over
module-scoped imports or variables from the calling file.

```ts
import { Logger, type SinkFactory } from '@dws-std/logger';

// A self-contained factory: no module-scoped imports captured.
const databaseSink: SinkFactory<{ query: string }, [dbUrl: string]> = (dbUrl: string) => {
	// Open the connection inside the factory — the worker owns it.
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

- `log` is the only required method.
- `flush` is optional — implement it when your sink buffers writes and you want `logger.flush()` to push them through.
- `close` is optional — implement it to release file handles, connections, etc.

## 🔒 Type-Safe Logging

When you define typed sinks, TypeScript knows exactly what shape your logs need. No more
guessing, no more runtime surprises.

### Single Typed Sink

```ts
import { Logger, type LoggerSink, type LogLevels, type SinkFactory } from '@dws-std/logger';

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

### Multiple Typed Sinks

When logging to multiple sinks at once, TypeScript creates an intersection of all the
targeted sinks' types — you must satisfy every one of them.

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

const logger = new Logger()
	.registerSink('user', userLogSink)
	.registerSink('api', apiLogSink);

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

### Mixing Typed and Untyped Sinks

When you mix typed sinks with untyped ones (like `consoleSink`, which accepts `unknown`),
things stay flexible: the intersection with `unknown` lets extra properties through.

```ts
import { Logger, consoleSink, type SinkFactory } from '@dws-std/logger';

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

// ✅ Works — the database type is enforced, console accepts anything
logger.info(
	{
		query: 'SELECT * FROM users',
		duration: 123,
		customData: 'anything goes'
	},
	['database', 'console']
);
```

## 🚨 Error Handling

Things break. When they do, you'll want to know:

```ts
import { Logger, consoleSink } from '@dws-std/logger';

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

## 🧹 Flushing and Closing

When you need to make sure everything is written before shutting down:

```ts
import { Logger, consoleSink } from '@dws-std/logger';

const logger = new Logger().registerSink('console', consoleSink);

logger.info({ message: 'First message' });
logger.info({ message: 'Second message' });

// Wait for all pending logs to be processed
await logger.flush();

// Close the logger and release resources (internally calls flush)
await logger.close();
```

`flush()` drains both the in-memory queue **and** each sink's own buffer (via the
optional `flush()` method on `LoggerSink`).

## ⚙️ Configuration

Fine-tune the batching and queue behavior:

```ts
import { Logger, consoleSink } from '@dws-std/logger';

const logger = new Logger({
	maxPendingLogs: 10_000, // Max queued logs (default: 10,000)
	batchSize: 100, // Logs per batch (default: 100)
	batchTimeout: 0.1, // Ms before flushing a partial batch (default: 0.1)
	maxMessagesInFlight: 100, // Max batches being processed (default: 100)
	autoEnd: true, // Auto-close on process exit (default: true)
	flushOnBeforeExit: true // Flush before exit (default: true)
}).registerSink('console', consoleSink);
```

## 📚 API Reference

Full docs: [https://dominus-web-service.github.io/std/](https://dominus-web-service.github.io/std/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [Dominus-Web-Service](https://github.com/Dominus-Web-Service/packages)