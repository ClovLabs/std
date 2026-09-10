// oxlint-disable typescript/ban-types
import { type KvStore, MemoryStore } from '@clov-std/kv-store';
import { Elysia, type HTTPHeaders } from 'elysia';

const isOpaque = (value: unknown): boolean =>
	value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value);

const MAX_KEY_LENGTH = 1024;

/**
 * Generates a cache key from a request and the body Elysia parsed for it
 *
 * The key is a readable string built like the rate limit plugin's: `method:url` followed by
 * the `vary` header values and the body. The cache macro prefixes it with `cache:` and
 * hashes it when it grows past the store's key limit.
 *
 * @param request - The request to generate a cache key for
 * @param body - The parsed body, keying on it avoids consuming the raw stream
 * @param vary - Header names to include in the key, every header is included when omitted.
 *   Iterating all of them is both the slowest part of this function and what fragments the
 *   cache per client, so a route that varies on a few headers should list them.
 * @returns The key, or `undefined` when the request cannot be keyed and must not be cached
 */
export const generateCacheKey = (
	request: Request,
	body?: unknown,
	vary?: string[]
): string | undefined => {
	const { method, url, headers } = request;
	let key = `${method}:${url}`;

	if (vary) for (const name of vary) key += `:${name}=${headers.get(name) ?? ''}`;
	else for (const [name, value] of headers) key += `:${name}=${value}`;

	if (typeof body === 'string') key += `:${body}`;
	else if (body !== undefined && body !== null) {
		if (isOpaque(body) || Object.values(body as Record<string, unknown>).some(isOpaque))
			return undefined;
		key += `:${JSON.stringify(body)}`;
	}

	return key;
};

interface CacheItem {
	response: unknown;
	metadata: {
		createdAt: string;
	};
}

// oxlint-disable-next-line typescript/consistent-type-definitions
type CacheDerived = {
	cacheKey?: string;
};

interface CacheDeriveContext {
	request: Request;
	body: unknown;
}

interface CacheContext extends CacheDerived {
	set: { headers: HTTPHeaders };
}

interface CacheAfterHandleContext extends CacheContext {
	responseValue: unknown;
}

export interface CacheOptions {
	/**
	 * TTL in seconds
	 */
	ttl: number;

	/**
	 * Header names the key varies on. Only those are hashed instead of every request header,
	 * which keeps the cache from fragmenting on `user-agent`, `accept-encoding`, etc.
	 *
	 * @defaultValue every request header
	 */
	vary?: string[];

	/**
	 * Builds the cache key for a request. Returning `undefined` leaves that request uncached,
	 * which is also the way to opt a request out
	 *
	 * @defaultValue {@link generateCacheKey}
	 */
	keyGenerator?: (
		request: Request,
		body: unknown
	) => string | undefined | Promise<string | undefined>;
}

type CacheMacro = (options: CacheOptions) => {
	derive: (context: CacheDeriveContext) => Promise<CacheDerived>;
	beforeHandle: (context: CacheContext) => Promise<unknown>;
	afterHandle: (context: CacheAfterHandleContext) => Promise<void>;
};

/**
 * Creates the cache plugin
 *
 * Elysia keeps one definition per plugin name, so every `cachePlugin()` of an app tree
 * resolves to a single plugin instance — the first one. Pass the store here to change it
 * for the whole app, a later `cachePlugin(store)` is ignored.
 */
export const cachePlugin = (
	store: KvStore = new MemoryStore()
): Elysia<
	'cachePlugin',
	'local',
	{ decorator: {}; derive: {}; store: {} },
	{ typebox: {}; error: [] },
	{
		schema: {};
		schemas: {};
		macro: Partial<{ readonly isCached: CacheOptions }>;
		macroFn: { isCached: CacheMacro };
		parser: {};
		response: {};
	}
> =>
	new Elysia<'cachePlugin'>({ name: 'cachePlugin' }).macro({
		isCached: (({
			ttl,
			vary = ['authorization'],
			keyGenerator = (request, body) => generateCacheKey(request, body, vary)
		}): {
			derive: (context: CacheDeriveContext) => Promise<CacheDerived>;
			beforeHandle: (context: CacheContext) => Promise<unknown>;
			afterHandle: (context: CacheAfterHandleContext) => Promise<void>;
		} => ({
			derive: async ({ request, body }): Promise<CacheDerived> => {
				const key = await keyGenerator(request, body);
				if (key === undefined) return {};

				const cacheKey = `cache:${key}`;
				if (cacheKey.length > MAX_KEY_LENGTH)
					return {
						cacheKey: `cache:${new Bun.CryptoHasher('sha256').update(cacheKey).digest('hex')}`
					};

				return { cacheKey };
			},
			beforeHandle: async ({ cacheKey, set }): Promise<unknown> => {
				if (cacheKey === undefined) return void 0;

				const cacheItem: CacheItem | null = await store.get(cacheKey);

				if (
					cacheItem &&
					typeof cacheItem === 'object' &&
					'response' in cacheItem &&
					'metadata' in cacheItem
				) {
					const createdAt = new Date(cacheItem.metadata.createdAt);
					const expiresAt = new Date(createdAt.getTime() + ttl * 1000);
					const remaining = Math.max(
						0,
						Math.ceil((expiresAt.getTime() - Date.now()) / 1000)
					);

					set.headers['cache-control'] = `max-age=${remaining}, private`;
					set.headers['x-cache'] = 'HIT';

					if (cacheItem.response instanceof Response) return cacheItem.response.clone();
					return cacheItem.response;
				}

				return void 0;
			},
			afterHandle: async ({ cacheKey, set, responseValue }): Promise<void> => {
				if (
					cacheKey === undefined ||
					responseValue === undefined ||
					set.headers['x-cache'] === 'HIT'
				)
					return;

				const now = new Date();
				set.headers['cache-control'] = `max-age=${ttl}, private`;
				set.headers['x-cache'] = 'MISS';

				const cacheItem: CacheItem = {
					response:
						responseValue instanceof Response ? responseValue.clone() : responseValue,
					metadata: {
						createdAt: now.toUTCString()
					}
				};

				await store.set(cacheKey, cacheItem, ttl);
			}
		})) satisfies CacheMacro
	});
