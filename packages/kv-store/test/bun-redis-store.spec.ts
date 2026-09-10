import { expect, test } from 'bun:test';

import { BunRedisStore } from '#/bun-redis-store';
import { MemoryStore } from '#/memory-store';

test.skipIf(!Bun.env.TEST_REDIS_URL)(
	'Redis preserves JSON values like MemoryStore and keeps counters numeric',
	async () => {
		const redis = new BunRedisStore(Bun.env.TEST_REDIS_URL);
		const memory = new MemoryStore();
		const key = `kv-store-test:${Bun.randomUUIDv7()}`;
		try {
			await redis.connect();
			for (const value of [
				'123',
				'true',
				'null',
				'"quoted"',
				'{"id":1}',
				'',
				'hello',
				123,
				true,
				null,
				{ id: 1 },
				[1, '2']
			]) {
				memory.set(key, value, 60);
				await redis.set(key, value, 60);
				expect(await redis.get(key)).toEqual(memory.get(key));
				expect(await redis.ttl(key)).toBeGreaterThan(0);
			}
			await redis.set(key, 10);
			expect(await redis.increment(key, 2)).toBe(12);
			expect(await redis.decrement(key)).toBe(11);
			expect(await redis.get(key)).toBe(11);
			await redis.set(key, '123');
			await expect(redis.increment(key)).rejects.toThrow();
			await redis.del(key);
			expect(await redis.get(key)).toBeNull();
		} finally {
			await redis.del(key);
			redis.close();
			memory.destroy();
		}
	}
);
