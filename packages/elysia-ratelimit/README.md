<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/elysia-ratelimit/logo-elysia-ratelimit.png" alt="Clov Elysia Rate Limit logo" width="200" />
</p>

# Clov Elysia Rate Limit

Rate limiting for Elysia, as a macro. Put `rateLimit: { limit: 10, window: 60 }` on a route, guard or group and you're done.

It runs in `transform`, the first per-route hook, so excess requests are rejected before auth guards or handlers do any work. Counters are per client IP by default, which suits login endpoints. When lots of users share one IP (an office, a corporate proxy), a `keyGenerator` lets you count per token, session, API key, or whatever fits.

Storage goes through `@clov-std/kv-store`: memory by default, Redis when you need it, same routes either way.

```bash
bun add @clov-std/elysia-ratelimit elysia typebox
```

`elysia` (v2) and `typebox` are peer dependencies.

## Usage

### Basic

`limit` is the max number of requests, `window` is in seconds.

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

### Redis

Pass a `BunRedisStore` (or any `KvStore` adapter) to keep counters across restarts and share them between instances.

```ts
import { rateLimitPlugin } from '@clov-std/elysia-ratelimit';
import { BunRedisStore } from '@clov-std/kv-store';
import { Elysia } from 'elysia';

const store = new BunRedisStore('redis://localhost:6379');

new Elysia()
	.use(rateLimitPlugin(store))
	.post('/auth/login', { rateLimit: { limit: 10, window: 60 } }, () => authenticate())
	.listen(3000);
```

### Per user instead of per IP

For authenticated routes behind a shared IP, give each user their own counter:

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

`extractClientIp` is exported if you need it in your own `keyGenerator`.

## Headers and the 429

Every response gets `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.

Once the limit is hit, the plugin throws Elysia's `problem()`, so the `429` is a full RFC 9457 document (`application/problem+json`) without any exception class to import:

```json
{
	"type": "rate-limit.quota.exceeded",
	"title": "Too Many Requests",
	"status": 429,
	"detail": "Limit of 100 requests per 60s exceeded. Retry in 42s."
}
```

- `type` is always `RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED`.
- `title` comes from Elysia, based on the status.
- `detail` reflects the current counter, so it changes from one 429 to the next.

The headers are set before the throw, so they're still on the `429`. The macro also declares this response for OpenAPI, so typed clients know about it.

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
