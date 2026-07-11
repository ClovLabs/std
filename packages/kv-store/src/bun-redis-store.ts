import { Exception } from '@clov-std/error';
import { RedisClient, type RedisOptions } from 'bun';

import { KvStore } from './kv-store';

export const BUN_REDIS_STORE_ERROR_KEYS = {
	CONNECTION_FAILED: 'kv-store.bun-redis-store.connection-failed'
} as const;

export class BunRedisStore extends KvStore {
	/**
	 * Redis client instance. Initialized in the constructor and connected in the `connect` method.
	 */
	private readonly redis: RedisClient;

	public constructor(url?: string, options?: RedisOptions) {
		super();
		this.redis = new RedisClient(url, options);
	}

	public override async connect(): Promise<void> {
		try {
			await this.redis.connect();
		} catch (error) {
			throw new Exception('Failed to connect to Redis', {
				key: BUN_REDIS_STORE_ERROR_KEYS.CONNECTION_FAILED,
				cause: error instanceof Error ? error : new Error(String(error))
			});
		}
	}

	public override close(): void {
		this.redis.close();
	}

	public override async get<T = unknown>(key: string): Promise<T | null> {
		KvStore.validateKey(key);

		const value = await this.redis.get(key);
		if (value === null) return null;

		try {
			const parsed: unknown = JSON.parse(value);
			return parsed as T;
		} catch {
			return value as T;
		}
	}

	public override async set<T = unknown>(key: string, value: T, ttlSec?: number): Promise<void> {
		KvStore.validateKey(key);
		KvStore.validateTtl(ttlSec);

		const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
		if (ttlSec) await this.redis.set(key, stringValue, 'EX', ttlSec);
		else await this.redis.set(key, stringValue);
	}

	public override increment(key: string, amount = 1): Promise<number> {
		KvStore.validateKey(key);
		KvStore.validateAmount(amount);
		return this.redis.incrby(key, amount);
	}

	public override decrement(key: string, amount = 1): Promise<number> {
		KvStore.validateKey(key);
		KvStore.validateAmount(amount);
		return this.redis.decrby(key, amount);
	}

	public override del(key: string): Promise<boolean> {
		KvStore.validateKey(key);
		return this.redis.del(key).then((result) => result > 0);
	}

	public override expire(key: string, ttlSec: number): Promise<boolean> {
		KvStore.validateKey(key);
		KvStore.validateTtl(ttlSec);
		return this.redis.expire(key, ttlSec).then((result) => result > 0);
	}

	public override ttl(key: string): Promise<number> {
		KvStore.validateKey(key);
		return this.redis.ttl(key);
	}

	public override async clean(): Promise<number> {
		const dbSize: number = (await this.redis.send('DBSIZE', [])) as number;
		await this.redis.send('FLUSHDB', ['ASYNC']);
		return dbSize;
	}
}
