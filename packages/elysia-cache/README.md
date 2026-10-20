<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/elysia-cache/logo-elysia-cache.svg" alt="Clov Elysia Cache logo" width="200" />
</p>

# Clov Elysia Cache

Response caching for Elysia, as a macro. Put `isCached: { ttl: 60 }` on a route, guard or group, and repeated requests are answered from the store in `beforeHandle`, before your handler runs.

Storage goes through `@clov-std/kv-store`: memory by default, Redis when you need it, same routes either way.

```bash
bun add @clov-std/elysia-cache elysia typebox
```

`elysia` (v2) and `typebox` are peer dependencies.

## Usage

### Basic

`ttl` is in seconds.

```ts
import { cachePlugin } from '@clov-std/elysia-cache';
import { Elysia } from 'elysia';

new Elysia()
	.use(cachePlugin())
	.get(
		'/catalog/items',
		{ isCached: { ttl: 60 } }, // cached for 60 seconds
		() => listItems()
	)
	.listen(3000);
```

### Redis

Pass a `BunRedisStore` (or any `KvStore` adapter) to keep the cache across restarts and share it between instances.

```ts
import { cachePlugin } from '@clov-std/elysia-cache';
import { BunRedisStore } from '@clov-std/kv-store';
import { Elysia } from 'elysia';

const store = new BunRedisStore('redis://localhost:6379');

new Elysia()
	.use(cachePlugin(store))
	.get('/catalog/items', { isCached: { ttl: 60 } }, () => listItems())
	.listen(3000);
```

> Elysia keeps one plugin instance per name, so the store has to go to the first `cachePlugin()` in the app tree. A later `cachePlugin(otherStore)` on the same app is ignored.

### `vary`

By default the key only includes the `authorization` header. If the response depends on other headers, list them:

```ts
new Elysia()
	.use(cachePlugin())
	.get(
		'/catalog/items',
		{ isCached: { ttl: 60, vary: ['authorization', 'accept-language'] } },
		() => listItems()
	)
	.listen(3000);
```

### Custom key

`keyGenerator` receives the `Request` and the parsed body. Return a string, or `undefined` to skip caching for that request (a promise of either works too). When it's set, `vary` is ignored.

```ts
import { cachePlugin, generateCacheKey } from '@clov-std/elysia-cache';
import { Elysia } from 'elysia';

new Elysia()
	.use(cachePlugin())
	.get(
		'/catalog/items',
		{
			isCached: {
				ttl: 60,
				keyGenerator: (request, body) =>
					generateCacheKey(request, body, ['accept-language'])
			}
		},
		() => listItems()
	)
	.listen(3000);
```

`generateCacheKey` is exported so you can keep the default format with your own headers.

## How it behaves

Keys are readable strings: `method:url`, the `vary` header values, then the parsed body. Keys over 1024 characters are hashed with SHA-256.

On a hit, the stored response is returned from `beforeHandle` with `X-Cache: HIT` and `Cache-Control: max-age=<remaining>, private`, where the remaining time is computed from when the entry was created.

On a miss, the handler runs, the response is stored for `ttl` seconds, and it goes out with `X-Cache: MISS` and `Cache-Control: max-age=<ttl>, private`.

A few things are never cached:

- `undefined` return values.
- Requests whose parsed body is or contains binary data (`Blob`, `ArrayBuffer`, typed arrays).

`Response` instances are cloned before being stored or replayed, so the same cached body can be served many times.

## API

### `cachePlugin(store?)`

Creates the plugin. `store` defaults to a new `MemoryStore`.

### `generateCacheKey(request, body?, vary?)`

Builds the key for a request. Without `vary`, every request header is included. Returns `undefined` when the body is binary and the request must not be cached.

### `CacheOptions`

| Option         | Type                                                                                       | Default                                 | Description                                                                |
| -------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| `ttl`          | `number`                                                                                   | -                                       | Time to live, in seconds.                                                  |
| `vary`         | `string[]`                                                                                 | `['authorization']`                     | Header names included in the key.                                          |
| `keyGenerator` | `(request: Request, body: unknown) => string \| undefined \| Promise<string \| undefined>` | `generateCacheKey(request, body, vary)` | Custom key builder. Returning `undefined` opts the request out of caching. |

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
