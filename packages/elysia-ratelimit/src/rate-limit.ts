// oxlint-disable typescript/ban-types
import { MemoryStore, type KvStore } from '@clov-std/kv-store';
import type { Server } from 'bun';
import { Elysia, problem, t, type HTTPHeaders } from 'elysia';
import { isIP } from 'node:net';

export const RATE_LIMIT_ERROR_CODES = {
	QUOTA_EXCEEDED: 'rate-limit.quota.exceeded'
} as const;

const rateLimitResponseSchema = t.Object({
	type: t.Literal(RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED, { description: 'Error code.' }),
	title: t.String({
		description: 'Short, human-readable summary of the error.'
	}),
	status: t.Literal(429, {
		description: 'HTTP status code, repeated in the body per RFC 9457.'
	}),
	detail: t.String({
		description: 'Explanation specific to this occurrence, including when to retry.'
	})
});

export interface RateLimitKeyContext {
	request: Request;
	server: Server<unknown> | null;
	ip: string;
	[key: string]: unknown;
}

export interface RateLimitMacroOptions {
	limit: number;
	window: number;
	/**
	 * Names the quota in the RateLimit fields, and separates its counters from other quotas.
	 * @default 'default'
	 */
	policy?: string;
	/**
	 * `transform` counts first, the key only knows the request.
	 * `derive` | `beforeHandle` count later, the key can read what earlier hooks added, like a user.
	 * @default 'transform'
	 */
	hook?: 'transform' | 'derive' | 'beforeHandle';

	// Elysia can't type what earlier hooks added: anything but a non-empty string throws
	keyGenerator?: (context: RateLimitKeyContext) => unknown;
}

interface RateLimitContext {
	set: { headers: HTTPHeaders };
	request: Request;
	server: Server<unknown> | null;
	path: string;
	route?: string;
}

interface RateLimitQuota {
	policy: string;
	key: string;
	limit: number;
	window: number;
}

type RateLimitHook = (context: RateLimitContext) => Promise<void>;

type RateLimitMacro = (options: RateLimitMacroOptions) => {
	response: { 429: typeof RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED };
} & ({ transform: RateLimitHook } | { derive: RateLimitHook } | { beforeHandle: RateLimitHook });

const isClientIp = (value: string | null | undefined): value is string =>
	typeof value === 'string' && isIP(value) !== 0 && !value.includes('%');

export const extractClientIp = (request: Request, server: Server<unknown> | null): string => {
	const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	if (isClientIp(forwardedIp)) return forwardedIp;

	const realIp = request.headers.get('x-real-ip');
	return isClientIp(realIp) ? realIp : (server?.requestIP(request)?.address ?? '127.0.0.1');
};

const countedRequests = new WeakMap<Request, Set<string>>();

// RateLimit fields are lists: each quota of the request adds its item to the current value
const appendHeader = (headers: HTTPHeaders, name: string, item: string): void => {
	const current = headers[name];
	headers[name] = typeof current === 'string' ? `${current}, ${item}` : item;
};

const consumeRateLimit = async (
	store: KvStore,
	{ set, request, path, route }: RateLimitContext,
	{ policy, key, limit, window }: RateLimitQuota
): Promise<void> => {
	const storeKey = `ratelimit:${policy}:${request.method}:${route ?? path}:${key}`;

	const counted = countedRequests.get(request) ?? new Set<string>();
	if (counted.has(storeKey)) return;
	countedRequests.set(request, counted.add(storeKey));

	const count = await store.increment(storeKey);
	if (count === 1) await store.expire(storeKey, window);

	const reset = await store.ttl(storeKey);

	// shortcut: RateLimit-Policy and RateLimit follow draft-ietf-httpapi-ratelimit-headers-11,
	// not an RFC yet: realign them when it is published
	appendHeader(set.headers, 'RateLimit-Policy', `"${policy}";q=${limit};w=${window}`);
	appendHeader(
		set.headers,
		'RateLimit',
		`"${policy}";r=${Math.max(0, limit - count)};t=${reset}`
	);

	if (count <= limit) return;

	// Retry-After (RFC 9110) is the standard one, it takes precedence over RateLimit
	set.headers['Retry-After'] = reset.toString();
	throw problem({
		type: RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED,
		status: 429,
		detail: `Limit of ${limit} requests per ${window}s exceeded. Retry in ${reset}s.`
	});
};

/**
 * Creates the rate limit plugin
 *
 * Elysia keeps one definition per plugin name, so every `rateLimitPlugin()` of an app tree
 * resolves to a single plugin instance — the first one. Pass the store here to change it
 * for the whole app, a later `rateLimitPlugin(store)` is ignored.
 */
export const rateLimitPlugin = (
	store: KvStore = new MemoryStore()
): Elysia<
	'rateLimitPlugin',
	'local',
	{ decorator: {}; derive: {}; store: {} },
	{
		typebox: { [RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED]: typeof rateLimitResponseSchema };
		error: [];
	},
	{
		schema: {};
		schemas: {};
		macro: Partial<{ readonly rateLimit: RateLimitMacroOptions }>;
		macroFn: {
			rateLimit: RateLimitMacro;
		};
		parser: {};
		response: {};
	}
> =>
	new Elysia<'rateLimitPlugin'>({ name: 'rateLimitPlugin' })
		.model({ [RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED]: rateLimitResponseSchema })
		.macro({
			rateLimit: (({
				limit,
				window,
				policy = 'default',
				hook = 'transform',
				keyGenerator
			}) => {
				const count: RateLimitHook = async (ctx) => {
					const ip = extractClientIp(ctx.request, ctx.server);
					const key = keyGenerator ? keyGenerator({ ...ctx, ip }) : ip;
					if (typeof key !== 'string' || key === '')
						throw new Error(
							`rateLimit "${policy}": keyGenerator returned no key, is the hook it reads declared before it?`
						);
					await consumeRateLimit(store, ctx, { policy, key, limit, window });
				};
				const response = { 429: RATE_LIMIT_ERROR_CODES.QUOTA_EXCEEDED } as const;

				if (hook === 'derive') return { response, derive: count };
				if (hook === 'beforeHandle') return { response, beforeHandle: count };
				return { response, transform: count };
			}) satisfies RateLimitMacro
		});
