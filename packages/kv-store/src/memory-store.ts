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
	private readonly _store = new Map<string, MemoryStoreEntry>();

	/**
	 * Cleanup interval (5 minutes by default).
	 *
	 * @defaultValue 300000
	 */
	private readonly _cleanupInterval: number;

	/**
	 * Maximum number of entries allowed in the store.
	 * Defaults to Infinity (no limit).
	 */
	private readonly _maxSize: number;

	/**
	 * Timer for cleanup operations.
	 */
	private _cleanupTimer: Timer | null = null;

	public constructor(cleanupIntervalMs?: number, maxSize?: number) {
		super();
		this._cleanupInterval = cleanupIntervalMs ?? 300000;
		this._maxSize = maxSize ?? Infinity;
		this._startCleanup();
	}

	public override get<T = unknown>(key: string): T | null {
		KvStore._validateKey(key);

		const entry = this._store.get(key);
		if (!entry) return null;

		const now = Date.now();
		if (now > entry.exp && entry.exp !== -1) {
			this._store.delete(key);
			return null;
		}

		return entry.value as T;
	}

	public override set<T = unknown>(key: string, value: T, ttlSec?: number): void {
		KvStore._validateKey(key);
		KvStore._validateTtl(ttlSec);

		if (this._store.size >= this._maxSize && !this._store.has(key))
			throw new Exception('Store is full', { key: MEMORY_STORE_ERROR_KEYS.STORE_IS_FULL });

		const exp = ttlSec ? Date.now() + ttlSec * 1000 : -1;
		this._store.set(key, { value, exp });
	}

	public override increment(key: string, amount = 1): number {
		KvStore._validateKey(key);
		KvStore._validateAmount(amount);
		return this._adjustBy(key, amount);
	}

	public override decrement(key: string, amount = 1): number {
		KvStore._validateKey(key);
		KvStore._validateAmount(amount);
		return this._adjustBy(key, -amount);
	}

	public override del(key: string): boolean {
		KvStore._validateKey(key);
		return this._store.delete(key);
	}

	public override expire(key: string, ttlSec: number): boolean {
		KvStore._validateKey(key);
		KvStore._validateTtl(ttlSec);

		const entry = this._store.get(key);
		if (!entry) return false;

		entry.exp = Date.now() + ttlSec * 1000;
		return true;
	}

	public override ttl(key: string): number {
		KvStore._validateKey(key);

		const entry = this._store.get(key);
		if (!entry) return -1;

		if (entry.exp === -1) return -1;

		const remaining = entry.exp - Date.now();
		return remaining > 0 ? Math.ceil(remaining / 1000) : -1;
	}

	public override clean(): number {
		const sizeBefore = this._store.size;
		this._store.clear();
		return sizeBefore;
	}

	private _startCleanup(): void {
		if (this._cleanupTimer) return;

		this._cleanupTimer = setInterval(() => {
			this._removeExpiredEntries();
		}, this._cleanupInterval);

		// Allow process to exit even if timer is running
		this._cleanupTimer.unref();
	}

	private _removeExpiredEntries(): void {
		const now = Date.now();

		for (const [key, entry] of this._store.entries())
			if (entry.exp !== -1 && now > entry.exp) this._store.delete(key);
	}

	public destroy(): void {
		if (this._cleanupTimer) {
			clearInterval(this._cleanupTimer);
			this._cleanupTimer = null;
		}
		this._store.clear();
	}

	private _adjustBy(key: string, amount: number): number {
		const now = Date.now();
		let currentValue = 0;
		let exp = -1;

		const entry = this._store.get(key);
		if (entry)
			if (entry.exp !== -1 && now > entry.exp) this._store.delete(key);
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
		this._store.set(key, { value: newValue, exp });
		return newValue;
	}
}
