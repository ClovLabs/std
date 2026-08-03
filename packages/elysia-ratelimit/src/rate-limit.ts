// oxlint-disable typescript/ban-types
import { Exception } from '@clov-std/error';
import { MemoryStore, type KvStore } from '@clov-std/kv-store';
import type { Server } from 'bun';
import { Elysia, t, type HTTPHeaders } from 'elysia';
import type { TLiteral, TObject, TOptional, TString } from 'typebox/type';

export const RATE_LIMIT_ERROR_KEYS = {
	RATE_LIMIT_EXCEEDED: 'elysia-ratelimit.exceeded'
} as const;

/** Counter state at the moment the limit was exceeded, attached as the exception `cause`. */
export interface RateLimitExceeded {
	/** Maximum requests allowed within the window. */
	readonly limit: number;

	/** Window length in seconds. */
	readonly window: number;

	/** Seconds until the counter resets. */
	readonly reset: number;
}

/**
 * Shape of the `429` body, following RFC 9457.
 */
const rateLimitResponseSchema = t.Object({
	type: t.String({
		description: `Error key. Defaults to \`${RATE_LIMIT_ERROR_KEYS.RATE_LIMIT_EXCEEDED}\`.`
	}),
	title: t.String({
		description: 'Short, human-readable summary of the error.'
	}),
	status: t.Literal(429, {
		description: 'HTTP status code, repeated in the body per RFC 9457.'
	}),
	detail: t.Optional(
		t.String({
			description: 'Explanation specific to this occurrence.'
		})
	)
});

/**
 * Thrown when a caller exceeds its allowance.
 *
 * @see {@link rateLimitResponseSchema}
 */
export class RateLimitException extends Exception<RateLimitExceeded> {
	/** HTTP status used by Elysia's error fallback. */
	public readonly status = 429;

	/** Default body used by Elysia's error fallback. */
	public readonly response: {
		readonly type: string;
		readonly title: string;
		readonly status: 429;
	} = {
		type: RATE_LIMIT_ERROR_KEYS.RATE_LIMIT_EXCEEDED,
		title: 'Too Many Requests',
		status: 429
	};

	/**
	 * Creates a new rate limit exception.
	 *
	 * @param cause - Counter state at the moment the limit was exceeded.
	 */
	public constructor(cause: RateLimitExceeded) {
		super('Too Many Requests', {
			key: RATE_LIMIT_ERROR_KEYS.RATE_LIMIT_EXCEEDED,
			cause
		});
	}
}

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

interface RateLimitTransformContext {
	set: { headers: HTTPHeaders };
	request: Request;
	server: Server<unknown> | null;
}

type RateLimitMacro = (options: RateLimitMacroOptions) => {
	response: { 429: typeof rateLimitResponseSchema };
	transform: (context: RateLimitTransformContext) => Promise<void>;
};

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
	'',
	'local',
	{ decorator: {}; derive: {}; store: {} },
	{ typebox: {}; error: [] },
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
	new Elysia().macro({
		rateLimit: (({
			limit,
			window,
			keyGenerator
		}): {
			response: {
				429: TObject<{
					type: TString;
					title: TString;
					status: TLiteral<429>;
					detail: TOptional<TString>;
				}>;
			};
			transform: ({ set, request, server }: RateLimitTransformContext) => Promise<void>;
		} => ({
			response: { 429: rateLimitResponseSchema },
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
				const reset = await store.ttl(key);

				set.headers['X-RateLimit-Limit'] = limit.toString();
				set.headers['X-RateLimit-Remaining'] = remaining.toString();
				set.headers['X-RateLimit-Reset'] = reset.toString();

				if (count > limit) {
					set.headers['content-type'] = 'application/problem+json';
					throw new RateLimitException({ limit, window, reset });
				}
			}
		})) satisfies RateLimitMacro
	});
