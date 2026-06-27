<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/Dominus-Web-Service/std@main/packages/elysia-ratelimit/logo-elysia-ratelimit.png" alt="DWS Elysia Rate Limit logo" width="200" />
</p>

# 🚦 DWS Elysia Rate Limit

Rate limiting for Elysia routes, guards, and groups, as a macro.  
Drop `rateLimit` on any endpoint and abusive traffic gets cut before it ever hits your logic.

## Why this package?

This plugin uses Elysia's macro system to add rate limiting to any route, guard, or group.  
You add `rateLimit: { limit: 10, window: 60 }` and you're done.

By default it limits by client IP, which works great for auth endpoints.  
For cases where many users share the same public IP (offices, corporate proxies), you can pass a `keyGenerator` to rate limit by IP + access token, session ID, API key, or any combination that makes sense.

Storage is handled by `@dws-std/kv-store`, so you start with in-memory and move to Redis when you need to, without changing your routes.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🎯 **Per-route macros** : Attach `rateLimit` to any route independently, with its own `limit` and `window`.
- 🔑 **Custom key generation** : Rate limit by IP (default), IP + token, session, or any key you compute.
- 🗃️ **KvStore-agnostic** : Works with `MemoryStore` out of the box; swap in `BunRedisStore` or your own adapter.
- ⚡ **Early rejection** : Runs in `transform`, the first per-route hook, before auth guards and handlers.
- 📡 **Standard headers** : Automatically sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

## 🔧 Installation

```bash
bun add @dws-std/elysia-ratelimit
```

> **Peer dependencies:** `elysia` must be installed alongside.

## ⚙️ Usage

### Basic - rate limit by IP

The simplest form: pass `limit` (max requests) and `window` (time in seconds). Each client IP gets its own counter.

```ts
import { rateLimitPlugin } from '@dws-std/elysia-ratelimit';
import { Elysia } from 'elysia';

new Elysia()
	.use(rateLimitPlugin())
	.post('/auth/login', () => authenticate(), {
		rateLimit: { limit: 10, window: 60 } // 10 requests per minute per IP
	})
	.listen(3000);
```

### Custom store - Redis

By default, counters are kept in memory. Pass a `BunRedisStore` (or any `KvStore` adapter) for persistence across restarts and multi-instance deployments.

```ts
import { BunRedisStore } from '@dws-std/kv-store';
import { rateLimitPlugin } from '@dws-std/elysia-ratelimit';
import { Elysia } from 'elysia';

const store = new BunRedisStore('redis://localhost:6379');

new Elysia()
	.use(rateLimitPlugin(store))
	.post('/auth/login', () => authenticate(), {
		rateLimit: { limit: 10, window: 60 }
	})
	.listen(3000);
```

### Custom key generation - IP + access token

Useful for authenticated routes where many users share the same public IP (office, corporate proxy).  
Each user has their own counter, independent of their network.

```ts
import { rateLimitPlugin } from '@dws-std/elysia-ratelimit';
import { Elysia } from 'elysia';

new Elysia()
	.use(rateLimitPlugin())
	.get('/api/data', () => getData(), {
		rateLimit: {
			limit: 100,
			window: 60,
			keyGenerator: ({ ip, request }) => `${ip}:${request.headers.get('authorization') ?? ip}`
		}
	})
	.listen(3000);
```

> **Tip:** `extractClientIp` is exported if you need it inside your own `keyGenerator`.

## 📚 API Reference

Full docs: [https://dominus-web-service.github.io/std/](https://dominus-web-service.github.io/std/)

## ⚖️ License

MIT — see [LICENSE.md](LICENSE.md).

## 📧 Contact

Maintained by [Dominus Web Services](https://github.com/Dominus-Web-Service).
