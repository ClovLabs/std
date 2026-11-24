import { Exception } from '@clov-std/error';

import { KvStore } from './kv-store';

export const MEMORY_STORE_ERROR_CODES = {
	STORE_FULL: 'kv-store.store.full',
	VALUE_NOT_NUMERIC: 'kv-store.value.not-numeric'
} as const;

interface MemoryStoreEntry {
	readonly value: unknown;
	/** Expiry as an epoch timestamp in milliseconds, or -1 for none. */
	exp: number;
}

/**
 * In-memory {@link KvStore} with TTL support.
 *
 * Expired entries are dropped when read and by a periodic background sweep.
 */
export class MemoryStore extends KvStore {
	private readonly store = new Map<string, MemoryStoreEntry>();

	/**
	 * Interval of the expired-entry sweep, in milliseconds.
	 *
	 * @defaultValue 300000
	 */
	private readonly cleanupInterval: number;

	/** Maximum number of entries, unlimited by default. */
	private readonly maxSize: number;

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
			throw new Exception('Store is full', { code: MEMORY_STORE_ERROR_CODES.STORE_FULL });

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

		// Same replies as Redis TTL: -2 for a missing (or expired) key, -1 for a key without expiry.
		const entry = this.store.get(key);
		if (!entry) return -2;

		if (entry.exp === -1) return -1;

		const remaining = entry.exp - Date.now();
		return remaining > 0 ? Math.ceil(remaining / 1000) : -2;
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

		// Don't keep the process alive just for the sweep
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
						code: MEMORY_STORE_ERROR_CODES.VALUE_NOT_NUMERIC,
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
