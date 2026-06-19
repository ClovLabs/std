// oxlint-disable typescript/ban-types
import { HttpException } from '@dws-std/error';
import { type KvStore, MemoryStore } from '@dws-std/kv-store';
import type { Server } from 'bun';
import { Elysia, type HTTPHeaders, type StatusMap } from 'elysia';

import { rateLimitContract } from './rate-limit.contract';

export const RATE_LIMIT_ERROR_KEYS = {
	RATE_LIMIT_EXCEEDED: 'rate-limit.exceeded'
} as const;

export interface RateLimitKeyContext {
	request: Request;
	server: Server<unknown> | null;
	ip: string;
}

export interface RateLimitMacroOptions {
	limit: number;
	window: number;
	keyGenerator?: (context: RateLimitKeyContext) => string;
}

export const extractClientIp = (request: Request, server: Server<unknown> | null): string => {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		const [first] = forwarded.split(',');
		if (first) return first.trim();
	}
	return request.headers.get('x-real-ip') ?? server?.requestIP(request)?.address ?? '127.0.0.1';
};

export const rateLimitPlugin = (
	store: KvStore = new MemoryStore()
): Elysia<
	'rateLimitPlugin',
	{ decorator: {}; derive: {}; resolve: {}; store: {} },
	{
		typebox: {
			RateLimitError: (typeof rateLimitContract)[429];
		};
		error: {};
	},
	{
		macro: Partial<{ readonly rateLimit: RateLimitMacroOptions }>;
		macroFn: {
			rateLimit: (options: RateLimitMacroOptions) => {
				response: { 429: 'RateLimitError' };
				transform: ({
					set,
					request,
					server
				}: {
					set: {
						headers: HTTPHeaders;
						status?: number | keyof StatusMap;
					};
					request: Request;
					server: Server<unknown> | null;
				}) => Promise<void>;
			};
		};
		parser: {};
		response: {};
		schema: {};
		standaloneSchema: {};
	}
> =>
	new Elysia<'rateLimitPlugin'>({
		name: 'rateLimitPlugin',
		seed: store
	})
		.model({
			RateLimitError: rateLimitContract[429]
		})
		.macro({
			rateLimit: ({ limit, window, keyGenerator }: RateLimitMacroOptions) => ({
				response: {
					429: 'RateLimitError'
				} as const,
				// Uses transform because it's the first per-route hook in Elysia's lifecycle,
				// running before derive, resolve, and beforeHandle.
				// onRequest would be ideal but it's global, it can't be scoped to macro-enabled routes.
				// A pending PR (https://github.com/elysiajs/elysia/pull/1557) would expose routes
				// in introspect, allowing onRequest with route filtering.
				transform: async ({ set, request, server }): Promise<void> => {
					const route = `${request.method}:${new URL(request.url).pathname}`;
					const ip = extractClientIp(request, server);
					const discriminator = keyGenerator ? keyGenerator({ request, server, ip }) : ip;
					const key = `ratelimit:${route}:${discriminator}`;

					const count = await store.increment(key);
					if (count === 1) await store.expire(key, window);

					const remaining = Math.max(0, limit - count);
					const resetTime = await store.ttl(key);

					set.headers['X-RateLimit-Limit'] = limit.toString();
					set.headers['X-RateLimit-Remaining'] = remaining.toString();
					set.headers['X-RateLimit-Reset'] = resetTime.toString();

					if (count > limit) {
						set.status = 429;
						throw new HttpException('Too Many Requests', {
							key: RATE_LIMIT_ERROR_KEYS.RATE_LIMIT_EXCEEDED,
							cause: { limit, window, remaining: 0, reset: resetTime },
							status: 429
						});
					}
				}
			})
		});
