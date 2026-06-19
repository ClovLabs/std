import { Exception } from '@dws-std/error';

import { KvStore } from './kv-store';

export const MEMORY_STORE_ERROR_KEYS = {
	STORE_IS_FULL: 'kv-store.memory-store.store-is-full',
	NOT_A_NUMBER: 'kv-store.memory-store.not-a-number'
} as const;

interface MemoryStoreEntry {
	/**
	 * The stored value for this entry.
	 */
	readonly value: unknown;
	/**
	 * Timestamp when this entry expires (in milliseconds).
	 * -1 means no expiration (like Redis behavior).
	 */
	exp: number;
}

/**
 * In-memory key-value store adapter with automatic cleanup of expired entries.
 *
 * Provides a memory-based implementation of {@link KvStore} with TTL support
 * and automatic background cleanup of expired entries.
 */
export class MemoryStore extends KvStore {
	/**
	 * In-memory key-value store.
	 */
	private readonly store = new Map<string, MemoryStoreEntry>();

	/**
	 * Cleanup interval (5 minutes by default).
	 *
	 * @defaultValue 300000
	 */
	private readonly cleanupInterval: number;

	/**
	 * Maximum number of entries allowed in the store.
	 * Defaults to Infinity (no limit).
	 */
	private readonly maxSize: number;

	/**
	 * Timer for cleanup operations.
	 */
	private cleanupTimer: Timer | null = null;

	public constructor(cleanupIntervalMs?: number, maxSize?: number) {
		super();
		this.cleanupInterval = cleanupIntervalMs ?? 300000;
		this.maxSize = maxSize ?? Infinity;
		this.startCleanup();
	}

	public override get<T = unknown>(key: string): T | null {
		KvStore.validateKey(key);

		const entry = this.store.get(key);
		if (!entry) return null;

		const now = Date.now();
		if (now > entry.exp && entry.exp !== -1) {
			this.store.delete(key);
			return null;
		}

		return entry.value as T;
	}

	public override set<T = unknown>(key: string, value: T, ttlSec?: number): void {
		KvStore.validateKey(key);
		KvStore.validateTtl(ttlSec);

		if (this.store.size >= this.maxSize && !this.store.has(key))
			throw new Exception('Store is full', { key: MEMORY_STORE_ERROR_KEYS.STORE_IS_FULL });

		const exp = ttlSec ? Date.now() + ttlSec * 1000 : -1;
		this.store.set(key, { value, exp });
	}

	public override increment(key: string, amount = 1): number {
		KvStore.validateKey(key);
		KvStore.validateAmount(amount);
		return this.adjustBy(key, amount);
	}

	public override decrement(key: string, amount = 1): number {
		KvStore.validateKey(key);
		KvStore.validateAmount(amount);
		return this.adjustBy(key, -amount);
	}

	public override del(key: string): boolean {
		KvStore.validateKey(key);
		return this.store.delete(key);
	}

	public override expire(key: string, ttlSec: number): boolean {
		KvStore.validateKey(key);
		KvStore.validateTtl(ttlSec);

		const entry = this.store.get(key);
		if (!entry) return false;

		entry.exp = Date.now() + ttlSec * 1000;
		return true;
	}

	public override ttl(key: string): number {
		KvStore.validateKey(key);

		const entry = this.store.get(key);
		if (!entry) return -1;

		if (entry.exp === -1) return -1;

		const remaining = entry.exp - Date.now();
		return remaining > 0 ? Math.ceil(remaining / 1000) : -1;
	}

	public override clean(): number {
		const sizeBefore = this.store.size;
		this.store.clear();
		return sizeBefore;
	}

	private startCleanup(): void {
		if (this.cleanupTimer) return;

		this.cleanupTimer = setInterval(() => {
			this.removeExpiredEntries();
		}, this.cleanupInterval);

		// Allow process to exit even if timer is running
		this.cleanupTimer.unref();
	}

	private removeExpiredEntries(): void {
		const now = Date.now();

		for (const [key, entry] of this.store.entries())
			if (entry.exp !== -1 && now > entry.exp) this.store.delete(key);
	}

	public destroy(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
		this.store.clear();
	}

	private adjustBy(key: string, amount: number): number {
		const now = Date.now();
		let currentValue = 0;
		let exp = -1;

		const entry = this.store.get(key);
		if (entry)
			if (entry.exp !== -1 && now > entry.exp) this.store.delete(key);
			else {
				if (entry.value !== null && typeof entry.value !== 'number')
					throw new Exception('Value is not a number', {
						key: MEMORY_STORE_ERROR_KEYS.NOT_A_NUMBER,
						cause: { key, value: entry.value }
					});
				currentValue = entry.value ?? 0;
				({ exp } = entry);
			}

		const newValue = currentValue + amount;
		this.store.set(key, { value: newValue, exp });
		return newValue;
	}
}
