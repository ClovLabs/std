import { Exception } from '@dws-std/error';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { MEMORY_STORE_ERROR_KEYS, MemoryStore } from '#/memory-store';

describe.concurrent('MemoryStore', () => {
	describe('Basic Operations', () => {
		test('should return null for non-existent key', () => {
			const store = new MemoryStore();
			expect(store.get<string>('nonexistent')).toBeNull();
			store.destroy();
		});

		test('should set and get a string value', () => {
			const store = new MemoryStore();
			store.set('key', 'value');
			expect(store.get<string>('key')).toBe('value');
			store.destroy();
		});

		test('should set and get a value with TTL', () => {
			const store = new MemoryStore();
			store.set('key', 'value', 60);
			expect(store.get<string>('key')).toBe('value');

			const ttl = store.ttl('key');
			expect(ttl).toBeGreaterThan(55);
			expect(ttl).toBeLessThanOrEqual(60);
			store.destroy();
		});

		test('should handle different value types', () => {
			const store = new MemoryStore();

			store.set('string', 'hello');
			expect(store.get<string>('string')).toBe('hello');

			store.set('number', 42);
			expect(store.get<number>('number')).toBe(42);

			const obj = { name: 'test', count: 5 };
			store.set('object', obj);
			expect(store.get<typeof obj>('object')).toEqual(obj);

			const arr = [1, 2, 3];
			store.set('array', arr);
			expect(store.get<number[]>('array')).toEqual(arr);

			store.destroy();
		});

		test('should overwrite existing key', () => {
			const store = new MemoryStore();
			store.set('key', 'first');
			store.set('key', 'second');
			expect(store.get<string>('key')).toBe('second');
			store.destroy();
		});
	});

	describe('Input Validation', () => {
		test('should throw on empty key', () => {
			const store = new MemoryStore();
			expect(() => store.get('')).toThrow(Exception);
			store.destroy();
		});

		test('should throw on key containing null byte', () => {
			const store = new MemoryStore();
			expect(() => store.set('key\0bad', 'value')).toThrow(Exception);
			store.destroy();
		});

		test('should throw on key exceeding 1024 characters', () => {
			const store = new MemoryStore();
			const longKey = 'a'.repeat(1025);
			expect(() => store.set(longKey, 'value')).toThrow(Exception);
			store.destroy();
		});

		test('should throw on non-positive TTL', () => {
			const store = new MemoryStore();
			expect(() => store.set('key', 'value', 0)).toThrow(Exception);
			expect(() => store.set('key', 'value', -1)).toThrow(Exception);
			store.destroy();
		});

		test('should throw on non-integer TTL', () => {
			const store = new MemoryStore();
			expect(() => store.set('key', 'value', 1.5)).toThrow(Exception);
			store.destroy();
		});

		test('should throw on non-integer increment amount', () => {
			const store = new MemoryStore();
			store.set('counter', 0);
			expect(() => store.increment('counter', 0.5)).toThrow(Exception);
			store.destroy();
		});

		test('should throw on NaN or Infinity amount', () => {
			const store = new MemoryStore();
			store.set('counter', 0);
			expect(() => store.increment('counter', NaN)).toThrow(Exception);
			expect(() => store.increment('counter', Infinity)).toThrow(Exception);
			store.destroy();
		});
	});

	describe('Increment / Decrement', () => {
		test('should increment by 1 by default', () => {
			const store = new MemoryStore();
			store.set('counter', 5);
			expect(store.increment('counter')).toBe(6);
			expect(store.get<number>('counter')).toBe(6);
			store.destroy();
		});

		test('should increment by custom amount', () => {
			const store = new MemoryStore();
			store.set('counter', 10);
			expect(store.increment('counter', 5)).toBe(15);
			store.destroy();
		});

		test('should decrement by 1 by default', () => {
			const store = new MemoryStore();
			store.set('counter', 10);
			expect(store.decrement('counter')).toBe(9);
			expect(store.get<number>('counter')).toBe(9);
			store.destroy();
		});

		test('should decrement by custom amount', () => {
			const store = new MemoryStore();
			store.set('counter', 20);
			expect(store.decrement('counter', 7)).toBe(13);
			store.destroy();
		});

		test('should initialize to 1 when incrementing a non-existent key', () => {
			const store = new MemoryStore();
			expect(store.increment('new')).toBe(1);
			expect(store.get<number>('new')).toBe(1);
			expect(store.ttl('new')).toBe(-1);
			store.destroy();
		});

		test('should initialize to -1 when decrementing a non-existent key', () => {
			const store = new MemoryStore();
			expect(store.decrement('new')).toBe(-1);
			expect(store.get<number>('new')).toBe(-1);
			store.destroy();
		});

		test('should throw when incrementing a non-number value', () => {
			const store = new MemoryStore();
			store.set('text', 'hello');

			try {
				store.increment('text');
				expect.unreachable('should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(MEMORY_STORE_ERROR_KEYS.NOT_A_NUMBER);
			}
			store.destroy();
		});

		test('should throw when decrementing a non-number value', () => {
			const store = new MemoryStore();
			store.set('obj', { count: 5 });

			try {
				store.decrement('obj');
				expect.unreachable('should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(MEMORY_STORE_ERROR_KEYS.NOT_A_NUMBER);
			}
			store.destroy();
		});

		test('should preserve TTL after increment', () => {
			const store = new MemoryStore();
			store.set('counter', 5, 60);

			const ttlBefore = store.ttl('counter');
			store.increment('counter');
			const ttlAfter = store.ttl('counter');

			expect(Math.abs(ttlAfter - ttlBefore)).toBeLessThan(2);
			store.destroy();
		});

		test('should handle zero and negative stored values', () => {
			const store = new MemoryStore();

			store.set('zero', 0);
			expect(store.increment('zero')).toBe(1);

			store.set('neg', -5);
			expect(store.increment('neg')).toBe(-4);
			expect(store.decrement('neg')).toBe(-5);

			store.destroy();
		});

		test('should throw on boolean values', () => {
			const store = new MemoryStore();
			store.set('bool', true);
			expect(() => store.increment('bool')).toThrow(Exception);
			store.destroy();
		});
	});

	describe('TTL Management', () => {
		test('should return -1 for non-existent key', () => {
			const store = new MemoryStore();
			expect(store.ttl('nonexistent')).toBe(-1);
			store.destroy();
		});

		test('should return -1 for key without TTL', () => {
			const store = new MemoryStore();
			store.set('persistent', 'value');
			expect(store.ttl('persistent')).toBe(-1);
			store.destroy();
		});

		test('should return remaining TTL in seconds', () => {
			const store = new MemoryStore();
			store.set('key', 'value', 120);

			const ttl = store.ttl('key');
			expect(ttl).toBeGreaterThan(115);
			expect(ttl).toBeLessThanOrEqual(120);
			store.destroy();
		});

		test('should update TTL with expire()', () => {
			const store = new MemoryStore();
			store.set('key', 'value');

			expect(store.expire('key', 30)).toBe(true);

			const ttl = store.ttl('key');
			expect(ttl).toBeGreaterThan(25);
			expect(ttl).toBeLessThanOrEqual(30);
			store.destroy();
		});

		test('should return false when expiring non-existent key', () => {
			const store = new MemoryStore();
			expect(store.expire('nonexistent', 30)).toBe(false);
			store.destroy();
		});
	});

	describe('Delete & Clean', () => {
		test('should delete an existing key', () => {
			const store = new MemoryStore();
			store.set('key', 'value');

			expect(store.del('key')).toBe(true);
			expect(store.get<string>('key')).toBeNull();
			store.destroy();
		});

		test('should return false when deleting non-existent key', () => {
			const store = new MemoryStore();
			expect(store.del('nonexistent')).toBe(false);
			store.destroy();
		});

		test('should clean all keys and return count', () => {
			const store = new MemoryStore();
			store.set('a', 1);
			store.set('b', 2);
			store.set('c', 3);

			expect(store.clean()).toBe(3);
			expect(store.get<number>('a')).toBeNull();
			expect(store.get<number>('b')).toBeNull();
			expect(store.get<number>('c')).toBeNull();
			store.destroy();
		});

		test('should return 0 when cleaning empty store', () => {
			const store = new MemoryStore();
			expect(store.clean()).toBe(0);
			store.destroy();
		});
	});

	describe('Expiration & Cleanup', () => {
		test('should expire entry after TTL elapses', async () => {
			const store = new MemoryStore();
			store.set('short', 'value', 1);

			expect(store.get<string>('short')).toBe('value');
			await Bun.sleep(1100);
			expect(store.get<string>('short')).toBeNull();

			store.destroy();
		});

		test('should reset to 1 when incrementing an expired key', async () => {
			const store = new MemoryStore();
			store.set('counter', 5, 1);

			await Bun.sleep(1100);

			expect(store.increment('counter')).toBe(1);
			expect(store.ttl('counter')).toBe(-1);
			store.destroy();
		});

		test('should automatically remove expired entries via cleanup interval', async () => {
			const store = new MemoryStore(100); // 100ms cleanup interval

			for (let i = 0; i < 5; ++i) store.set(`temp${i}`, `v${i}`, 1);
			for (let i = 0; i < 3; ++i) store.set(`keep${i}`, `v${i}`, 60);

			await Bun.sleep(1500);

			for (let i = 0; i < 5; ++i) expect(store.get<string>(`temp${i}`)).toBeNull();
			for (let i = 0; i < 3; ++i) expect(store.get<string>(`keep${i}`)).toBe(`v${i}`);

			store.destroy();
		});

		test('should not remove keys without expiration during cleanup', async () => {
			const store = new MemoryStore(100);

			store.set('persistent', 'value');
			store.set('temporary', 'value', 1);

			await Bun.sleep(1200);

			expect(store.get<string>('persistent')).toBe('value');
			expect(store.get<string>('temporary')).toBeNull();

			store.destroy();
		});
	});

	describe('Max Size', () => {
		test('should throw when store is full and inserting a new key', () => {
			const store = new MemoryStore(undefined, 2);
			store.set('a', 1);
			store.set('b', 2);

			try {
				store.set('c', 3);
				expect.unreachable('should have thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(MEMORY_STORE_ERROR_KEYS.STORE_IS_FULL);
			}
			store.destroy();
		});

		test('should allow overwriting existing key when store is full', () => {
			const store = new MemoryStore(undefined, 2);
			store.set('a', 1);
			store.set('b', 2);

			store.set('a', 99);
			expect(store.get<number>('a')).toBe(99);
			store.destroy();
		});

		test('should allow inserts after freeing space', () => {
			const store = new MemoryStore(undefined, 2);
			store.set('a', 1);
			store.set('b', 2);
			store.del('a');

			store.set('c', 3);
			expect(store.get<number>('c')).toBe(3);
			store.destroy();
		});
	});

	describe('Destroy', () => {
		test('should clear all data and stop cleanup timer', () => {
			const store = new MemoryStore();
			store.set('key', 'value');

			store.destroy();

			expect(store.get<string>('key')).toBeNull();
		});

		test('should be safe to call destroy multiple times', () => {
			const store = new MemoryStore();
			store.destroy();
			expect(() => store.destroy()).not.toThrow();
		});
	});

	describe('Lifecycle (beforeEach / afterEach)', () => {
		let store: MemoryStore;

		beforeEach(() => {
			store = new MemoryStore();
		});

		afterEach(() => {
			store.destroy();
		});

		test('should handle rapid sequential increments', () => {
			store.set('counter', 0);
			for (let i = 0; i < 100; ++i) store.increment('counter');
			expect(store.get<number>('counter')).toBe(100);
		});

		test('should keep keys independent', () => {
			store.set('a', 'alpha', 60);
			store.set('b', 'beta', 120);
			store.set('c', 0);

			store.increment('c', 10);

			expect(store.get<string>('a')).toBe('alpha');
			expect(store.get<string>('b')).toBe('beta');
			expect(store.get<number>('c')).toBe(10);
		});

		test('should maintain data integrity during cleanup', async () => {
			const shortLived = new MemoryStore(50);

			shortLived.set('persist1', 'v1');
			shortLived.set('persist2', 'v2');
			shortLived.set('temp1', 'v1', 1);
			shortLived.set('temp2', 'v2', 1);

			await Bun.sleep(1200);

			expect(shortLived.get<string>('persist1')).toBe('v1');
			expect(shortLived.get<string>('persist2')).toBe('v2');
			expect(shortLived.get<string>('temp1')).toBeNull();
			expect(shortLived.get<string>('temp2')).toBeNull();

			shortLived.destroy();
		});
	});
});
