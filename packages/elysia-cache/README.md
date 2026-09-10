<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/elysia-cache/logo-elysia-cache.png" alt="Clov Elysia Cache logo" width="200" />
</p>

# ⚡ Clov Elysia Cache

Response caching for Elysia routes, guards, and groups, as a macro.  
Drop `isCached` on any endpoint and repeated requests are served from the store before your logic ever runs.

## Why this package?

This plugin uses Elysia's macro system to add response caching to any route, guard, or group.  
You add `isCached: { ttl: 60 }` and you're done.

Cache keys are readable strings built from the request method, URL, the `vary` headers (default: `authorization`), and the parsed body - so different inputs never collide. `generateCacheKey` builds them, and keys longer than 1024 characters are hashed with SHA-256 before being stored.

Storage is handled by `@clov-std/kv-store`, so you start with in-memory and move to Redis when you need to, without changing your routes.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Cache semantics](#-cache-semantics)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🎯 **Per-route macros** : Attach `isCached` to any route independently, with its own `ttl` and options.
- 🔑 **Readable keys** : `method:url`, the `vary` header values, and the parsed body - SHA-256 hashed only when the key exceeds 1024 characters.
- 🗃️ **KvStore-agnostic** : Works with `MemoryStore` out of the box; swap in `BunRedisStore` or your own adapter.
- ⚡ **Early serving** : Returns the cached response in `beforeHandle`, before handlers run.
- 📡 **Cache headers** : Sets `Cache-Control: max-age=N, private` and `X-Cache: HIT` / `MISS`.
- 🛡️ **Opaque-body safety** : Requests carrying `Blob` / `ArrayBuffer` / typed-array bodies are never keyed, never cached.

## 🔧 Installation

```bash
bun add @clov-std/elysia-cache elysia typebox
```

> **Peer dependencies:** `elysia`(v2) and `typebox` must be installed alongside.

## ⚙️ Usage

### Basic - cache GET responses

The simplest form: pass `ttl` (time to live in seconds). Responses are cached for that window.

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

### Custom store - Redis

By default, cached responses are kept in memory. Pass a `BunRedisStore` (or any `KvStore` adapter) for persistence across restarts and multi-instance deployments.

```ts
import { BunRedisStore } from '@clov-std/kv-store';
import { cachePlugin } from '@clov-std/elysia-cache';
import { Elysia } from 'elysia';

const store = new BunRedisStore('redis://localhost:6379');

new Elysia()
	.use(cachePlugin(store))
	.get('/catalog/items', { isCached: { ttl: 60 } }, () => listItems())
	.listen(3000);
```

> **Note:** Elysia keeps one plugin instance per name, so the store must be passed to the first `cachePlugin()` used in the app tree. A later `cachePlugin(otherStore)` on the same app is ignored.

### Narrowing the key - `vary`

The default key only includes the `authorization` header. If a route varies on more headers, list them in `vary`:

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

### Custom key generation

For full control, pass a `keyGenerator`. It receives the `Request` and the parsed body, and can return a string, `undefined` (opts the request out of caching), or a promise of either. When provided, `vary` is not used.

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

> **Tip:** `generateCacheKey` is exported so you can reuse the default key format with your own header subset.

## 🧯 Cache semantics

A cache hit short-circuits the handler: the stored response is returned from `beforeHandle` with `X-Cache: HIT` and `Cache-Control: max-age=<remaining>, private`, computed from the entry's creation time.

A miss runs the handler, stores the response with the `ttl`, and stamps `X-Cache: MISS` with `Cache-Control: max-age=<ttl>, private`. `Response` instances are cloned before being stored or replayed, so a cached body can be reused across requests. `undefined` return values are never cached, and requests whose parsed body is (or contains) binary data (`Blob`, `ArrayBuffer`, typed arrays) are skipped entirely.

## 📚 API Reference

### `cachePlugin(store?)`

Creates the plugin. `store` defaults to a new `MemoryStore`.

### `generateCacheKey(request, body?, vary?)`

Builds the key for a request: `method:url`, the `vary` header values, then the parsed body. Without `vary`, every request header is included. Returns `undefined` when the body is opaque and the request must not be cached.

### `CacheOptions`

| Option         | Type                                                                                       | Default                                 | Description                                                                |
| -------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| `ttl`          | `number`                                                                                   | -                                       | Time to live, in seconds.                                                  |
| `vary`         | `string[]`                                                                                 | `['authorization']`                     | Header names included in the key.                                          |
| `keyGenerator` | `(request: Request, body: unknown) => string \| undefined \| Promise<string \| undefined>` | `generateCacheKey(request, body, vary)` | Custom key builder. Returning `undefined` opts the request out of caching. |

Full docs: [https://clovlabs.github.io/std/](https://clovlabs.github.io/std/)

## ⚖️ License

MIT - see [LICENSE.md](LICENSE.md).

## 📧 Contact

Maintained by [Clov](https://github.com/ClovLabs).
