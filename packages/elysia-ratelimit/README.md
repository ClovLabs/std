<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/elysia-ratelimit/logo-elysia-ratelimit.png" alt="Clov Elysia Rate Limit logo" width="200" />
</p>

# 🚦 Clov Elysia Rate Limit

Rate limiting for Elysia routes, guards, and groups, as a macro.  
Drop `rateLimit` on any endpoint and abusive traffic gets cut before it ever hits your logic.

## Why this package?

This plugin uses Elysia's macro system to add rate limiting to any route, guard, or group.  
You add `rateLimit: { limit: 10, window: 60 }` and you're done.

By default it limits by client IP, which works great for auth endpoints.  
For cases where many users share the same public IP (offices, corporate proxies), you can pass a `keyGenerator` to rate limit by IP + access token, session ID, API key, or any combination that makes sense.

Storage is handled by `@clov-std/kv-store`, so you start with in-memory and move to Redis when you need to, without changing your routes.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Error handling](#-error-handling)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🎯 **Per-route macros** : Attach `rateLimit` to any route independently, with its own `limit` and `window`.
- 🔑 **Custom key generation** : Rate limit by IP (default), IP + token, session, or any key you compute.
- 🗃️ **KvStore-agnostic** : Works with `MemoryStore` out of the box; swap in `BunRedisStore` or your own adapter.
- ⚡ **Early rejection** : Runs in `transform`, the first per-route hook, before auth guards and handlers.
- 📡 **Standard headers** : Automatically sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- 🧯 **Complete RFC 9457 `429`** : Answers a real problem document on its own, `detail` included, with no exception class to import.

## 🔧 Installation

```bash
bun add @clov-std/elysia-ratelimit elysia typebox
```

> **Peer dependencies:** `elysia` (v2) and `typebox` must be installed alongside.

## ⚙️ Usage

### Basic - rate limit by IP

The simplest form: pass `limit` (max requests) and `window` (time in seconds). Each client IP gets its own counter.

```ts
import { rateLimitPlugin } from '@clov-std/elysia-ratelimit';
import { Elysia } from 'elysia';

new Elysia()
	.use(rateLimitPlugin())
	.post(
		'/auth/login',
		{ rateLimit: { limit: 10, window: 60 } }, // 10 requests per minute per IP
		() => authenticate()
	)
	.listen(3000);
```

### Custom store - Redis

By default, counters are kept in memory. Pass a `BunRedisStore` (or any `KvStore` adapter) for persistence across restarts and multi-instance deployments.

```ts
import { BunRedisStore } from '@clov-std/kv-store';
import { rateLimitPlugin } from '@clov-std/elysia-ratelimit';
import { Elysia } from 'elysia';

const store = new BunRedisStore('redis://localhost:6379');

new Elysia()
	.use(rateLimitPlugin(store))
	.post('/auth/login', { rateLimit: { limit: 10, window: 60 } }, () => authenticate())
	.listen(3000);
```

### Custom key generation - IP + access token

Useful for authenticated routes where many users share the same public IP (office, corporate proxy).  
Each user has their own counter, independent of their network.

```ts
import { rateLimitPlugin } from '@clov-std/elysia-ratelimit';
import { Elysia } from 'elysia';

new Elysia()
	.use(rateLimitPlugin())
	.get(
		'/api/data',
		{
			rateLimit: {
				limit: 100,
				window: 60,
				keyGenerator: ({ ip, request }) =>
					`${ip}:${request.headers.get('authorization') ?? ip}`
			}
		},
		() => getData()
	)
	.listen(3000);
```

> **Tip:** `extractClientIp` is exported if you need it inside your own `keyGenerator`.

## 🧯 Error handling

When the allowance is exceeded, the plugin throws Elysia's `problem()`, so the `429` is a complete
RFC 9457 document with no exception class and no error dependency involved:

```json
{
	"type": "rate-limit.quota.exceeded",
	"title": "Too Many Requests",
	"status": 429,
	"detail": "Limit of 100 requests per 60s exceeded. Retry in 42s."
}
```

`type` is always `RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED`. `title` is derived by Elysia from the
status reason phrase. `detail` carries the live counter state, so it changes per occurrence.
The content type is `application/problem+json`, and the `X-RateLimit-*` headers are set before
the throw so they survive on the `429`.

This is also the response the macro declares for OpenAPI, so a typed client sees it.

### ⚠️ Guard your catch-all

An error hook only overrides the response when it **returns** one. A catch-all that answers
unconditionally swallows every thrown status, this `429` included — and equally a plain
`throw status(404)` from one of your own handlers:

```ts
// ✅ passes through anything that already carries a status
.error(({ error }) =>
	(error as { status?: number }).status === undefined
		? problem({ type: 'internal.server.error', status: 500 })
		: undefined
)

// ❌ turns every 429 into a 500
.error(() => problem({ type: 'internal.server.error', status: 500 }))
```

## 📚 API Reference

Full docs: [https://clovlabs.github.io/std/](https://clovlabs.github.io/std/)

## ⚖️ License

MIT — see [LICENSE.md](LICENSE.md).

## 📧 Contact

Maintained by [Clov](https://github.com/ClovLabs).
