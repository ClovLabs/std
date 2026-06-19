import { Exception } from '@dws-std/error';

export const KV_STORE_ERROR_KEYS = {
	INVALID_KEY: 'kv-store.invalid-key',
	INVALID_TTL: 'kv-store.invalid-ttl',
	INVALID_AMOUNT: 'kv-store.invalid-amount'
} as const;

/**
 * Abstract base class for key-value store adapters.
 *
 * Provides static validation helpers. Subclasses implement the public
 * methods directly and call the validators as needed.
 */
export abstract class KvStore {
	public connect?(): Promise<void> | void;
	public close?(): Promise<void> | void;

	/**
	 * Validates a key string and throws an exception if it's invalid.
	 *
	 * @param key - The key to validate.
	 *
	 * @throws ({@link Exception}) - If the key is invalid.
	 */
	protected static validateKey(key: string): void {
		if (!key || typeof key !== 'string' || key.length > 1024 || key.includes('\0'))
			throw new Exception('Invalid key', {
				key: KV_STORE_ERROR_KEYS.INVALID_KEY,
				cause: { key }
			});
	}

	/**
	 * Validates a TTL value and throws an exception if it's invalid.
	 *
	 * @param ttlSec - The TTL value to validate.
	 *
	 * @throws ({@link Exception}) - If the TTL is invalid.
	 */
	protected static validateTtl(ttlSec: number | undefined): void {
		if (ttlSec === undefined) return;

		if (!Number.isFinite(ttlSec) || ttlSec <= 0 || !Number.isInteger(ttlSec))
			throw new Exception('Invalid TTL', {
				key: KV_STORE_ERROR_KEYS.INVALID_TTL,
				cause: { ttlSec }
			});
	}

	/**
	 * Validates an increment/decrement amount and throws an exception if it's invalid.
	 *
	 * @param amount - The amount to validate.
	 *
	 * @throws ({@link Exception}) - If the amount is invalid.
	 */
	protected static validateAmount(amount: number): void {
		if (!Number.isFinite(amount) || !Number.isInteger(amount))
			throw new Exception('Invalid amount', {
				key: KV_STORE_ERROR_KEYS.INVALID_AMOUNT,
				cause: { amount }
			});
	}

	public abstract get<T = unknown>(key: string): T | null | Promise<T | null>;
	public abstract set<T = unknown>(key: string, value: T, ttlSec?: number): void | Promise<void>;
	public abstract increment(key: string, amount?: number): number | Promise<number>;
	public abstract decrement(key: string, amount?: number): number | Promise<number>;
	public abstract del(key: string): boolean | Promise<boolean>;
	public abstract expire(key: string, ttlSec: number): boolean | Promise<boolean>;
	public abstract ttl(key: string): number | Promise<number>;
	public abstract clean(): number | Promise<number>;
}
