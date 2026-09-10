import { MemoryStore } from '@clov-std/kv-store';
import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import { cachePlugin } from '#/cache';

describe.concurrent('cachePlugin', () => {
	test('should serve the second identical request from the cache', async () => {
		let calls = 0;
		const app = new Elysia().use(cachePlugin()).get('/test', { isCached: { ttl: 60 } }, () => {
			++calls;
			return { calls };
		});

		const miss = await app.handle(new Request('http://localhost/test'));
		const hit = await app.handle(new Request('http://localhost/test'));

		expect(miss.headers.get('x-cache')).toBe('MISS');
		expect(hit.headers.get('x-cache')).toBe('HIT');
		expect(hit.headers.get('cache-control')).toMatch(/^max-age=\d+, private$/);
		expect(await hit.json()).toEqual({ calls: 1 });
		expect(calls).toBe(1);
	});

	test('should cache a body-carrying route from its first request', async () => {
		let calls = 0;
		const app = new Elysia()
			.use(cachePlugin())
			.post('/test', { isCached: { ttl: 60 } }, ({ body }) => {
				++calls;
				return { calls, body };
			});
		const post = (id: number): Request =>
			new Request('http://localhost/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id })
			});

		const miss = await app.handle(post(1));
		const hit = await app.handle(post(1));
		const otherBody = await app.handle(post(2));

		expect(miss.headers.get('x-cache')).toBe('MISS');
		expect(hit.headers.get('x-cache')).toBe('HIT');
		expect(await hit.json()).toEqual({ calls: 1, body: { id: 1 } });
		expect(otherBody.headers.get('x-cache')).toBe('MISS');
		expect(calls).toBe(2);
	});

	test('should leave an upload uncached, a file body cannot be keyed', async () => {
		let calls = 0;
		const app = new Elysia()
			.use(cachePlugin())
			.post('/test', { isCached: { ttl: 60 } }, ({ body }) => {
				++calls;
				return { calls, fields: Object.keys(body as Record<string, unknown>) };
			});
		const upload = (): Request => {
			const form = new FormData();
			form.set('file', new Blob(['hello']), 'a.txt');
			return new Request('http://localhost/test', { method: 'POST', body: form });
		};

		const first = await app.handle(upload());
		const second = await app.handle(upload());

		expect(first.status).toBe(200);
		expect(second.headers.get('x-cache')).toBeNull();
		expect(calls).toBe(2);
	});

	test('should not write a hit back to the store', async () => {
		let writes = 0;
		class CountingStore extends MemoryStore {
			public override set<T = unknown>(key: string, value: T, ttlSec?: number): void {
				++writes;
				super.set(key, value, ttlSec);
			}
		}
		const app = new Elysia()
			.use(cachePlugin(new CountingStore()))
			.get('/test', { isCached: { ttl: 60 } }, ({ cacheKey }) => ({ cacheKey }));

		const miss = await app.handle(new Request('http://localhost/test'));
		await app.handle(new Request('http://localhost/test'));
		await app.handle(new Request('http://localhost/test'));

		// The handler sees the derived key, and only its own response was ever stored
		expect(((await miss.json()) as { cacheKey: string }).cacheKey).toStartWith(
			'cache:GET:http://localhost/test'
		);
		expect(writes).toBe(1);
	});

	test('should use the provided keyGenerator', async () => {
		const keys: string[] = [];
		const keyGenerator = (request: Request): string => {
			const key = new URL(request.url).searchParams.get('user') ?? 'anonymous';
			keys.push(key);
			return `user:${key}`;
		};
		const app = new Elysia()
			.use(cachePlugin())
			.get('/test', { isCached: { ttl: 60, keyGenerator } }, ({ cacheKey }) => cacheKey);

		const first = await app.handle(new Request('http://localhost/test?user=ruby'));
		const hit = await app.handle(new Request('http://localhost/test?user=ruby'));
		const other = await app.handle(new Request('http://localhost/test?user=clov'));

		expect(new Set(keys)).toEqual(new Set(['ruby', 'clov']));
		expect(await first.text()).toBe('cache:user:ruby');
		expect(hit.headers.get('x-cache')).toBe('HIT');
		expect(other.headers.get('x-cache')).toBe('MISS');
	});

	test('should only key on the listed vary headers', async () => {
		let calls = 0;
		const app = new Elysia()
			.use(cachePlugin())
			.get('/test', { isCached: { ttl: 60, vary: ['authorization'] } }, () => ++calls);
		const request = (userAgent: string, authorization = 'Bearer a'): Request =>
			new Request('http://localhost/test', {
				headers: { 'user-agent': userAgent, authorization }
			});

		await app.handle(request('UA-1'));
		const otherClient = await app.handle(request('UA-2'));
		const otherToken = await app.handle(request('UA-1', 'Bearer b'));

		// user-agent is ignored, same token hits; another token misses
		expect(otherClient.headers.get('x-cache')).toBe('HIT');
		expect(otherToken.headers.get('x-cache')).toBe('MISS');
		expect(calls).toBe(2);
	});
});
