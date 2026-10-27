// oxlint-disable promise/no-await-in-loop
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import { RATE_LIMIT_ERROR_CODES, rateLimitPlugin, type RateLimitMacroOptions } from '#/rate-limit';

const exceed = async (
	app: { handle: (request: Request) => Promise<Response> },
	url: string,
	ip: string,
	requests: number
): Promise<Response> => {
	const send = (): Promise<Response> =>
		app.handle(
			new Request(`http://localhost${url}`, {
				headers: { 'x-forwarded-for': ip }
			})
		);

	for (let i = 1; i < requests; ++i) await send();
	return send();
};

describe.concurrent('rateLimitPlugin without an error handler', () => {
	test('should send the RateLimit fields and no Retry-After under the limit', async () => {
		const limit = 3;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/test', { rateLimit: { limit, window: 60 } }, () => 'OK');

		for (let i = 1; i <= limit; ++i) {
			const response = await exceed(app, '/test', '127.0.0.1', 1);

			expect(response.status).toEqual(200);
			expect(response.headers.get('RateLimit-Policy')).toEqual(`"default";q=${limit};w=60`);
			expect(response.headers.get('RateLimit')).toEqual(`"default";r=${limit - i};t=60`);
			expect(response.headers.get('Retry-After')).toBeNull();
		}
	});

	test('should answer 429 with the documented problem document on its own', async () => {
		const limit = 2;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/limited', { rateLimit: { limit, window: 60 } }, () => 'OK');

		const response = await exceed(app, '/limited', '10.0.0.1', limit + 1);

		expect(response.status).toEqual(429);
		expect(response.headers.get('content-type')).toEqual('application/problem+json');
		expect(await response.json()).toEqual({
			type: RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED,
			// Derived by Elysia from the 429 reason phrase, the plugin never supplies it.
			title: 'Too Many Requests',
			status: 429,
			detail: `Limit of ${limit} requests per 60s exceeded. Retry in 60s.`
		});
	});

	test('should send Retry-After and an empty RateLimit on the 429', async () => {
		const ip = '10.0.0.2';
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/headers', { rateLimit: { limit: 1, window: 60 } }, () => 'OK');

		const response = await exceed(app, '/headers', ip, 2);

		expect(response.status).toEqual(429);
		expect(parseInt(response.headers.get('Retry-After') ?? '0', 10)).toBeGreaterThan(0);
		expect(response.headers.get('RateLimit')).toEqual('"default";r=0;t=60');
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

	test('should skip a forwarded header that is not an IP', async () => {
		const limit = 1;
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get('/forged', { rateLimit: { limit, window: 60 } }, () => 'OK');

		const response1 = await app.handle(
			new Request('http://localhost/forged', {
				headers: { 'x-forwarded-for': 'not-an-ip', 'x-real-ip': '6.6.6.6' }
			})
		);
		expect(response1.status).toEqual(200);

		const response2 = await app.handle(
			new Request('http://localhost/forged', {
				headers: { 'x-forwarded-for': 'fe80::1%eth0', 'x-real-ip': '6.6.6.6' }
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

	test('should share one quota across path parameter values', async () => {
		const app = new Elysia()
			.use(rateLimitPlugin())
			.get(
				'/guarded/:idA/foo/:idFoo/bar/:idBar',
				{ rateLimit: { limit: 1, window: 60 } },
				() => 'OK'
			);

		const first = await exceed(app, '/guarded/1/foo/2/bar/3', '22.0.0.1', 1);
		const second = await exceed(app, '/guarded/2/foo/3/bar/4', '22.0.0.1', 1);

		expect(first.status).toEqual(200);
		expect(second.status).toEqual(429);
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

		const response3 = await app.handle(
			new Request('http://localhost/custom-key', {
				headers: { 'x-forwarded-for': '8.8.8.8', authorization: 'Bearer token-a' }
			})
		);
		expect(response3.status).toEqual(429);
	});
});

describe.concurrent('rateLimitPlugin keyed on what earlier hooks added', () => {
	const userQuota = (idUser: string, limit: number): RateLimitMacroOptions => ({
		policy: 'user',
		hook: 'derive',
		limit,
		window: 30,
		keyGenerator: (): string => idUser
	});

	test('should key on what an earlier derive added', async () => {
		const app = new Elysia()
			.use(rateLimitPlugin())
			.derive(() => ({ idUser: 'u1' }))
			.get(
				'/users/:id',
				{
					rateLimit: {
						policy: 'user',
						hook: 'derive',
						limit: 1,
						window: 30,
						keyGenerator: ({ idUser }) => idUser
					}
				},
				() => 'OK'
			);

		const first = await exceed(app, '/users/1', '24.0.0.1', 1);
		const second = await exceed(app, '/users/2', '24.0.0.2', 1);

		expect(first.status).toEqual(200);
		expect(first.headers.get('RateLimit')).toEqual('"user";r=0;t=30');
		expect(second.status).toEqual(429);
		expect(second.headers.get('Retry-After')).toEqual('30');
	});

	test('should list each quota in the RateLimit fields', async () => {
		const app = new Elysia()
			.use(rateLimitPlugin())
			.guard({ rateLimit: userQuota('u2', 1) }, (guarded) =>
				guarded.get('/both', { rateLimit: { limit: 5, window: 60 } }, () => 'OK')
			);

		const response = await exceed(app, '/both', '24.0.0.3', 1);

		expect(response.headers.get('RateLimit-Policy')).toEqual(
			'"default";q=5;w=60, "user";q=1;w=30'
		);
		expect(response.headers.get('RateLimit')).toEqual('"default";r=4;t=60, "user";r=0;t=30');
	});

	test('should count a request once when its quota is declared at several levels', async () => {
		const app = new Elysia()
			.use(rateLimitPlugin())
			.guard({ rateLimit: userQuota('u3', 2) }, (guarded) =>
				guarded.get('/once', { rateLimit: userQuota('u3', 2) }, () => 'OK')
			);

		const response = await exceed(app, '/once', '24.0.0.4', 1);

		expect(response.status).toEqual(200);
		expect(response.headers.get('RateLimit')).toEqual('"user";r=1;t=30');
	});

	test('should key on what a derive added with a beforeHandle hook', async () => {
		const app = new Elysia()
			.use(rateLimitPlugin())
			.derive(() => ({ idUser: 'u4' }))
			.get(
				'/resolved',
				{
					rateLimit: {
						policy: 'user',
						hook: 'beforeHandle',
						limit: 1,
						window: 30,
						keyGenerator: ({ idUser }) => idUser
					}
				},
				() => 'OK'
			);

		const first = await exceed(app, '/resolved', '24.0.0.5', 1);
		const second = await exceed(app, '/resolved', '24.0.0.6', 1);

		expect(first.status).toEqual(200);
		expect(second.status).toEqual(429);
	});

	test('should fail loudly when the key is read before the hook adding it', async () => {
		const app = new Elysia().use(rateLimitPlugin()).get(
			'/misordered',
			{
				rateLimit: {
					policy: 'user',
					hook: 'derive',
					limit: 5,
					window: 30,
					keyGenerator: ({ idUser }) => idUser
				}
			},
			() => 'OK'
		);

		const response = await exceed(app, '/misordered', '24.0.0.7', 1);

		expect(response.status).toEqual(500);
	});
});
