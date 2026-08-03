// oxlint-disable promise/no-await-in-loop
import { describe, expect, test } from 'bun:test';
import { Elysia, status } from 'elysia';

import { RATE_LIMIT_ERROR_CODES, rateLimitPlugin } from '#/rate-limit';

interface RateLimitBody {
	type: string;
	title: string;
	/** Optional here only because the catch-all handler below never sets it. */
	status?: number;
	detail?: string;
}

/**
 * Mirrors an API error plugin's catch-all. Returning `undefined` for anything that already
 * carries a status is what lets a thrown `problem()` reach the client untouched; an error
 * hook only overrides the response when it returns one.
 */
const errorPlugin = new Elysia({ name: 'error-plugin' })
	.error(({ error }) =>
		(error as { status?: number }).status === undefined
			? status(500, {
					type: 'internal',
					title: 'Internal Server Error',
					detail: error.message
				})
			: undefined
	)
	.as('global');

describe.concurrent('rateLimitPlugin without an error handler', () => {
	test('should return correct rate limit headers for valid requests', async () => {
		const ip = '127.0.0.1';
		const limit = 3;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/test', { rateLimit: { limit, window: 60 } }, () => 'OK');

		for (let i = 0; i < limit; ++i) {
			const response = await app.handle(
				new Request('http://localhost/test', {
					headers: { 'x-forwarded-for': ip }
				})
			);
			expect(response.status).toEqual(200);
			expect(response.headers.get('X-RateLimit-Limit')).toEqual(limit.toString());
			expect(response.headers.get('X-RateLimit-Remaining')).toEqual(
				(limit - i - 1).toString()
			);
			expect(parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10)).toBeGreaterThan(
				0
			);
		}
	});

	test('should answer 429 with the documented body on its own', async () => {
		const ip = '10.0.0.1';
		const limit = 2;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/limited', { rateLimit: { limit, window: 60 } }, () => 'OK');

		for (let i = 0; i < limit; ++i)
			await app.handle(
				new Request('http://localhost/limited', {
					headers: { 'x-forwarded-for': ip }
				})
			);

		const response = await app.handle(
			new Request('http://localhost/limited', {
				headers: { 'x-forwarded-for': ip }
			})
		);

		expect(response.status).toEqual(429);
		const body = (await response.json()) as RateLimitBody;
		expect(body).toEqual({
			type: RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED,
			// Derived by Elysia from the 429 reason phrase, the plugin never supplies it.
			title: 'Too Many Requests',
			status: 429,
			detail: `Limit of ${limit} requests per 60s exceeded. Retry in 60s.`
		});
	});

	test('should keep the rate limit headers on the 429', async () => {
		const ip = '10.0.0.2';
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/headers', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');

		await app.handle(
			new Request('http://localhost/headers', { headers: { 'x-forwarded-for': ip } })
		);
		const response = await app.handle(
			new Request('http://localhost/headers', { headers: { 'x-forwarded-for': ip } })
		);

		expect(response.status).toEqual(429);
		expect(response.headers.get('X-RateLimit-Limit')).toEqual('1');
		expect(response.headers.get('X-RateLimit-Remaining')).toEqual('0');
		expect(parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10)).toBeGreaterThan(0);
	});

	test('should answer the 429 as application/problem+json', async () => {
		const ip = '10.0.0.3';
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/content-type', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');

		const ok = await app.handle(
			new Request('http://localhost/content-type', { headers: { 'x-forwarded-for': ip } })
		);
		expect(ok.status).toEqual(200);
		// `problem` sets the content type on the 429 only, it must not leak on success.
		// Coalesced because a plain 200 carries no content-type at all here.
		expect(ok.headers.get('content-type') ?? '').not.toInclude('problem');

		const response = await app.handle(
			new Request('http://localhost/content-type', { headers: { 'x-forwarded-for': ip } })
		);

		expect(response.status).toEqual(429);
		expect(response.headers.get('content-type')).toEqual('application/problem+json');
	});

	test('should track different IPs separately', async () => {
		const limit = 1;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/per-ip', { rateLimit: { limit, window: 60 } }, () => 'OK');

		const responseA = await app.handle(
			new Request('http://localhost/per-ip', {
				headers: { 'x-forwarded-for': '1.1.1.1' }
			})
		);
		expect(responseA.status).toEqual(200);

		const responseB = await app.handle(
			new Request('http://localhost/per-ip', {
				headers: { 'x-forwarded-for': '2.2.2.2' }
			})
		);
		expect(responseB.status).toEqual(200);
	});

	test('should extract the first IP from x-forwarded-for', async () => {
		const limit = 1;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/xff', { rateLimit: { limit, window: 60 } }, () => 'OK');

		// First request with chained IPs
		const response1 = await app.handle(
			new Request('http://localhost/xff', {
				headers: { 'x-forwarded-for': '3.3.3.3, 10.0.0.1, 192.168.1.1' }
			})
		);
		expect(response1.status).toEqual(200);

		// Second request from same client IP (first in chain) should be limited
		const response2 = await app.handle(
			new Request('http://localhost/xff', {
				headers: { 'x-forwarded-for': '3.3.3.3, 10.0.0.2' }
			})
		);
		expect(response2.status).toEqual(429);
	});

	test('should track different routes independently', async () => {
		const limit = 1;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/route-a', { rateLimit: { limit, window: 60 } }, () => 'A')
			.get('/route-b', { rateLimit: { limit, window: 60 } }, () => 'B');

		const ip = '5.5.5.5';

		const responseA = await app.handle(
			new Request('http://localhost/route-a', {
				headers: { 'x-forwarded-for': ip }
			})
		);
		expect(responseA.status).toEqual(200);

		const responseB = await app.handle(
			new Request('http://localhost/route-b', {
				headers: { 'x-forwarded-for': ip }
			})
		);
		expect(responseB.status).toEqual(200);
	});

	test('should fall back to x-real-ip when x-forwarded-for is absent', async () => {
		const limit = 1;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/real-ip', { rateLimit: { limit, window: 60 } }, () => 'OK');

		const response1 = await app.handle(
			new Request('http://localhost/real-ip', {
				headers: { 'x-real-ip': '7.7.7.7' }
			})
		);
		expect(response1.status).toEqual(200);

		const response2 = await app.handle(
			new Request('http://localhost/real-ip', {
				headers: { 'x-real-ip': '7.7.7.7' }
			})
		);
		expect(response2.status).toEqual(429);
	});

	test('should use custom keyGenerator for rate limiting', async () => {
		const limit = 1;
		const app = new Elysia().use(rateLimitPlugin()).get(
			'/custom-key',
			{
				rateLimit: {
					limit,
					window: 60,
					keyGenerator: ({ ip, request }) =>
						`${ip}:${request.headers.get('authorization') ?? 'anon'}`
				}
			},
			() => 'OK'
		);

		// Same IP, different tokens — should NOT share the limit
		const response1 = await app.handle(
			new Request('http://localhost/custom-key', {
				headers: { 'x-forwarded-for': '8.8.8.8', authorization: 'Bearer token-a' }
			})
		);
		expect(response1.status).toEqual(200);

		const response2 = await app.handle(
			new Request('http://localhost/custom-key', {
				headers: { 'x-forwarded-for': '8.8.8.8', authorization: 'Bearer token-b' }
			})
		);
		expect(response2.status).toEqual(200);

		// Same IP + same token — should be limited
		const response3 = await app.handle(
			new Request('http://localhost/custom-key', {
				headers: { 'x-forwarded-for': '8.8.8.8', authorization: 'Bearer token-a' }
			})
		);
		expect(response3.status).toEqual(429);
	});

	test('should rate limit by session when keyGenerator uses session id', async () => {
		const limit = 1;
		const app = new Elysia().use(rateLimitPlugin()).get(
			'/session',
			{
				rateLimit: {
					limit,
					window: 60,
					keyGenerator: ({ request }) => request.headers.get('x-session-id') ?? 'unknown'
				}
			},
			() => 'OK'
		);

		// Same IP but different sessions — should NOT share the limit
		const response1 = await app.handle(
			new Request('http://localhost/session', {
				headers: { 'x-forwarded-for': '9.9.9.9', 'x-session-id': 'sess-1' }
			})
		);
		expect(response1.status).toEqual(200);

		const response2 = await app.handle(
			new Request('http://localhost/session', {
				headers: { 'x-forwarded-for': '9.9.9.9', 'x-session-id': 'sess-2' }
			})
		);
		expect(response2.status).toEqual(200);

		// Same session — should be limited
		const response3 = await app.handle(
			new Request('http://localhost/session', {
				headers: { 'x-forwarded-for': '9.9.9.9', 'x-session-id': 'sess-1' }
			})
		);
		expect(response3.status).toEqual(429);
	});

	test('should rate limit authenticated routes by ip + accessToken', async () => {
		const limit = 2;
		const sharedIp = '42.42.42.42';
		const app = new Elysia().use(rateLimitPlugin()).get(
			'/api/data',
			{
				rateLimit: {
					limit,
					window: 60,
					keyGenerator: ({ ip, request }) =>
						`${ip}:${request.headers.get('authorization') ?? ip}`
				}
			},
			() => 'OK'
		);

		// User A (same office IP) exhausts their limit
		for (let i = 0; i < limit; ++i) {
			const response = await app.handle(
				new Request('http://localhost/api/data', {
					headers: {
						'x-forwarded-for': sharedIp,
						authorization: 'Bearer access-user-a'
					}
				})
			);
			expect(response.status).toEqual(200);
		}

		// User A is now limited
		const blockedA = await app.handle(
			new Request('http://localhost/api/data', {
				headers: {
					'x-forwarded-for': sharedIp,
					authorization: 'Bearer access-user-a'
				}
			})
		);
		expect(blockedA.status).toEqual(429);

		// User B on the same IP still has their own budget
		for (let i = 0; i < limit; ++i) {
			const response = await app.handle(
				new Request('http://localhost/api/data', {
					headers: {
						'x-forwarded-for': sharedIp,
						authorization: 'Bearer access-user-b'
					}
				})
			);
			expect(response.status).toEqual(200);
		}

		// User B is now also limited
		const blockedB = await app.handle(
			new Request('http://localhost/api/data', {
				headers: {
					'x-forwarded-for': sharedIp,
					authorization: 'Bearer access-user-b'
				}
			})
		);
		expect(blockedB.status).toEqual(429);
	});
});

describe.concurrent('rateLimitPlugin behind an application catch-all', () => {
	const exceed = async (app: { handle: (request: Request) => Promise<Response> }, ip: string) => {
		await app.handle(
			new Request('http://localhost/guarded', {
				headers: { 'x-forwarded-for': ip }
			})
		);
		return app.handle(
			new Request('http://localhost/guarded', {
				headers: { 'x-forwarded-for': ip }
			})
		);
	};

	test('should answer its own problem document, not the catch-all body', async () => {
		const app = new Elysia()
			.use(errorPlugin)
			.use(rateLimitPlugin())
			.get('/guarded', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');

		const response = await exceed(app, '20.0.0.1');

		expect(response.status).toEqual(429);
		const body = (await response.json()) as RateLimitBody;
		expect(body.type).toEqual(RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED);
		expect(body.title).toEqual('Too Many Requests');
		expect(body.detail).toEqual('Limit of 1 requests per 60s exceeded. Retry in 60s.');
	});

	test('should keep the problem content type behind a catch-all', async () => {
		const app = new Elysia()
			.use(errorPlugin)
			.use(rateLimitPlugin())
			.get('/guarded', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');

		const response = await exceed(app, '20.0.0.3');

		expect(response.status).toEqual(429);
		expect(response.headers.get('content-type')).toEqual('application/problem+json');
	});

	test('should keep the rate limit headers set before the throw', async () => {
		const app = new Elysia()
			.use(errorPlugin)
			.use(rateLimitPlugin())
			.get('/guarded', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');

		const response = await exceed(app, '20.0.0.2');

		expect(response.status).toEqual(429);
		expect(response.headers.get('X-RateLimit-Limit')).toEqual('1');
		expect(response.headers.get('X-RateLimit-Remaining')).toEqual('0');
	});

	test('should answer the same 429 whichever plugin is mounted first', async () => {
		const errorFirst = new Elysia()
			.use(errorPlugin)
			.use(rateLimitPlugin())
			.get('/guarded', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');
		const rateLimitFirst = new Elysia()
			.use(rateLimitPlugin())
			.use(errorPlugin)
			.get('/guarded', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');

		const responses = [
			await exceed(errorFirst, '21.0.0.1'),
			await exceed(rateLimitFirst, '21.0.0.2')
		];

		for (const response of responses) {
			expect(response.status).toEqual(429);
			const body = (await response.json()) as RateLimitBody;
			expect(body.type).toEqual(RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED);
		}
	});

	test('should leave unrelated errors to the catch-all', async () => {
		const app = new Elysia()
			.use(errorPlugin)
			.use(rateLimitPlugin())
			.get('/boom', { rateLimit: { limit: 5, window: 60 } }, () => {
				throw new Error('boom');
			});

		const response = await app.handle(
			new Request('http://localhost/boom', { headers: { 'x-forwarded-for': '23.0.0.1' } })
		);

		expect(response.status).toEqual(500);
		const body = (await response.json()) as RateLimitBody;
		expect(body.type).toEqual('internal');
		expect(body.detail).toEqual('boom');
	});
});
