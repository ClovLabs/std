<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/Dominus-Web-Service/std@main/packages/kv-store/logo-kv-store.png" alt="DWS KV Store logo" width="200" />
</p>

# 🗃️ DWS KV Store

A lightweight, abstract key-value store with TTL support, increment/decrement operations, and built-in input validation.  
Swap between in-memory and Redis without changing a single line of business logic.

## Why this package?

Every project eventually needs a key-value store — for caching, rate-limiting, sessions, counters, etc.  
You either couple yourself to a specific backend or build your own abstraction every time.

`@dws-std/kv-store` gives you a clean `KvStore` base class with two ready-to-use adapters:

- **`MemoryStore`** — in-memory Map with TTL, automatic expired-entry cleanup, and configurable max size.
- **`BunRedisStore`** — thin wrapper around Bun's native `RedisClient`, same API, no surprises.

Both share the same interface, so switching from memory to Redis (or writing your own adapter) is trivial.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🔑 **Unified API** : `get`, `set`, `del`, `increment`, `decrement`, `expire`, `ttl`, `clean` — same interface for every adapter.
- ⏱️ **TTL Support** : Set expiration in seconds on any key.
- 🛡️ **Built-in Validation** : Keys, TTL values, and amounts are validated before reaching the storage layer.
- 🧠 **MemoryStore** : Zero-dependency in-memory store with background cleanup and optional max size.
- 🔴 **BunRedisStore** : Native Bun Redis adapter, async by default.
- 📦 **Zero External Dependencies** : Only depends on `@dws-std/error`.

## 🔧 Installation

```bash
bun add @dws-std/kv-store
```

## ⚙️ Usage

### MemoryStore — In-Memory

```ts
import { MemoryStore } from '@dws-std/kv-store';

const store = new MemoryStore();

store.set('user:42', { name: 'Alice' }, 300); // TTL of 5 minutes
const user = store.get<{ name: string }>('user:42');

store.set('hits', 0);
store.increment('hits'); // 1
store.increment('hits', 5); // 6
store.decrement('hits'); // 5

store.ttl('user:42'); // remaining seconds
store.del('user:42'); // true
store.clean(); // removes all keys, returns count

store.destroy(); // stops cleanup timer and clears data
```

You can configure the cleanup interval and max size:

```ts
const store = new MemoryStore(
	60_000, // cleanup every 60 seconds (default: 5 minutes)
	10_000 // max 10 000 entries (default: Infinity)
);
```

### BunRedisStore — Redis

```ts
import { BunRedisStore } from '@dws-std/kv-store';

const store = new BunRedisStore('redis://localhost:6379');
await store.connect();

await store.set('session:abc', { userId: 1 }, 3600);
const session = await store.get<{ userId: number }>('session:abc');

await store.increment('rate:ip:127.0.0.1');
await store.expire('rate:ip:127.0.0.1', 60);

store.close();
```

### Custom Adapter

Extend `KvStore` and implement the abstract methods:

```ts
import { KvStore } from '@dws-std/kv-store';

class MyStore extends KvStore {
	get<T>(key: string): T | null {
		/* ... */
	}
	set<T>(key: string, value: T, ttlSec?: number): void {
		/* ... */
	}
	increment(key: string, amount?: number): number {
		/* ... */
	}
	decrement(key: string, amount?: number): number {
		/* ... */
	}
	del(key: string): boolean {
		/* ... */
	}
	expire(key: string, ttlSec: number): boolean {
		/* ... */
	}
	ttl(key: string): number {
		/* ... */
	}
	clean(): number {
		/* ... */
	}
}
```

Use `KvStore._validateKey()`, `KvStore._validateTtl()`, and `KvStore._validateAmount()` for built-in validation.

## 📚 API Reference

Full docs: [https://dominus-web-service.github.io/std/](https://dominus-web-service.github.io/std/)

## ⚖️ License

MIT — Feel free to use it.

## 📧 Contact

- GitHub: [Dominus-Web-Service](https://github.com/Dominus-Web-Service/packages)
