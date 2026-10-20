<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/kv-store/logo-kv-store.svg" alt="Clov KV Store logo" width="200" />
</p>

# Clov KV Store

A small key-value store interface with TTLs and counters, and two adapters behind it:

- `MemoryStore`: a `Map` with TTLs, periodic cleanup of expired entries, and an optional max size.
- `BunRedisStore`: a thin wrapper around Bun's `RedisClient`.

Both expose `get`, `set`, `del`, `increment`, `decrement`, `expire`, `ttl` and `clean`, so code written against memory in dev runs unchanged on Redis in prod. Keys, TTLs and amounts are validated before they reach the backend. The only dependency is `@clov-std/error`.

```bash
bun add @clov-std/kv-store
```

## `MemoryStore`

```ts
import { MemoryStore } from '@clov-std/kv-store';

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

The cleanup interval and max size are configurable:

```ts
const store = new MemoryStore(
	60_000, // cleanup every 60 seconds (default: 5 minutes)
	10_000 // max 10 000 entries (default: Infinity)
);
```

## `BunRedisStore`

Same API, but async.

```ts
import { BunRedisStore } from '@clov-std/kv-store';

const store = new BunRedisStore('redis://localhost:6379');
await store.connect();

await store.set('session:abc', { userId: 1 }, 3600);
const session = await store.get<{ userId: number }>('session:abc');

await store.increment('rate:ip:127.0.0.1');
await store.expire('rate:ip:127.0.0.1', 60);

store.close();
```

`set` JSON-encodes every value, strings included, so `"123"`, `"true"` or `"null"` come back as strings. Numbers stay compatible with Redis counters.

When upgrading, note that raw strings already in Redis that happen to look like JSON can't be told apart from encoded values. Rewrite those keys from their source, or let them expire.

To run the Redis contract test against a throwaway instance, from this package:

```bash
TEST_REDIS_URL=redis://127.0.0.1:6379 bun test test/bun-redis-store.spec.ts
```

It only touches keys prefixed with a unique `kv-store-test:`.

## Writing your own adapter

Extend `KvStore` and implement its methods. Each one can be sync or return a promise, whichever your backend needs. The protected static `validateKey()`, `validateTtl()` and `validateAmount()` give you the same checks as the built-in adapters.

```ts
import { KvStore } from '@clov-std/kv-store';

class MyStore extends KvStore {
	public async get<T>(key: string): Promise<T | null> {
		KvStore.validateKey(key);
		throw new Error('Not implemented');
	}
	public async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
		KvStore.validateKey(key);
		KvStore.validateTtl(ttlSec);
		throw new Error('Not implemented');
	}
	public async increment(key: string, amount: number = 1): Promise<number> {
		KvStore.validateAmount(amount);
		throw new Error('Not implemented');
	}
	public async decrement(key: string, amount: number = 1): Promise<number> {
		KvStore.validateAmount(amount);
		throw new Error('Not implemented');
	}
	public async del(key: string): Promise<boolean> {
		throw new Error('Not implemented');
	}
	public async expire(key: string, ttlSec: number): Promise<boolean> {
		throw new Error('Not implemented');
	}
	public async ttl(key: string): Promise<number> {
		throw new Error('Not implemented');
	}
	public async clean(): Promise<number> {
		throw new Error('Not implemented');
	}
}
```

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
