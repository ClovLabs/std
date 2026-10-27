<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/elysia-ratelimit/logo-elysia-ratelimit.svg" alt="Clov Elysia Rate Limit logo" width="200" />
</p>

# Clov Elysia Rate Limit

Rate limiting for Elysia, as a macro. Put `rateLimit: { limit: 10, window: 60 }` on a route, guard or group and you're done.

It runs in `transform`, the first per-route hook, so excess requests are rejected before auth guards or handlers do any work. Counters are per route pattern and client IP by default, which suits login endpoints: `/users/1` and `/users/2` share the quota of `/users/:id`. When lots of users share one IP (an office, a corporate proxy), count per authenticated user instead, with the `derive` hook.

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

A `transform` hook only knows the request. To count per user, run the quota in `derive` (or `beforeHandle`), after the hook that authenticates, and key it on what that hook added. Give the quota its own `policy`, so its counters and headers stay apart from the per-IP one:

```ts
new Elysia()
	.use(rateLimitPlugin())
	.macro({
		requireAuth: {
			derive: async ({ headers }) => ({ idUser: await authenticate(headers) }),
			// declared after the derive: derives run in declaration order
			rateLimit: {
				policy: 'user',
				hook: 'derive',
				limit: 300,
				window: 60,
				keyGenerator: ({ idUser }) => idUser
			}
		}
	})
	.get('/api/data', { requireAuth: true }, () => getData())
	.listen(3000);
```

Elysia can't type what earlier hooks added, so `keyGenerator` returns `unknown`: anything but a non-empty string throws, so a key read before the hook adding it fails loudly instead of putting every client in one quota. A quota declared at several levels (a guard and its route) counts a request once.

`extractClientIp` is exported if you need it in your own `keyGenerator`.

## Headers and the 429

Every limited response lists its quotas in the `RateLimit-Policy` and `RateLimit` fields of [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/), one item per policy:

```http
RateLimit-Policy: "default";q=10;w=60, "user";q=300;w=60
RateLimit: "default";r=9;t=60, "user";r=299;t=60
```

The `429` adds the standard `Retry-After` (RFC 9110), in seconds.

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

The fields are set before the throw, so they're still on the `429`. The macro also declares this response for OpenAPI, so typed clients know about it.

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
