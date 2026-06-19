import { Exception } from '@dws-std/error';

/** Error codes thrown by the {@link Registry} class. */
export const REGISTRY_ERROR_KEYS = {
	CLASS_INSTANCE_ALREADY_REGISTERED: 'registry.class-instance-already-registered',
	CLASS_INSTANCE_NOT_REGISTERED: 'registry.class-instance-not-registered'
} as const;

/**
 * Global, type-safe store for named instances.
 *
 * Register an instance once at startup, then retrieve it anywhere
 * by name without passing references around.
 *
 * @example
 * ```ts
 * Registry.register('db', new DatabaseConnection());
 * const db = Registry.get<DatabaseConnection>('db');
 * ```
 */
// eslint-disable-next-line
export class Registry {
	private static readonly registry = new Map<string, unknown>();

	/**
	 * Stores `instance` under the given `name`.
	 *
	 * Each name can only be registered once. Call {@link unregister} first
	 * if you need to replace an existing instance.
	 *
	 * @template TClass - The type of the instance being stored.
	 *
	 * @param name - Unique identifier for this instance.
	 * @param instance - The object to store.
	 *
	 * @throws ({@link Exception}) - `name` is already taken.
	 */
	public static register<TClass extends object>(name: string, instance: TClass): void {
		if (this.registry.has(name))
			throw new Exception(`Instance already registered: ${name}`, {
				key: REGISTRY_ERROR_KEYS.CLASS_INSTANCE_ALREADY_REGISTERED,
				cause: name
			});
		this.registry.set(name, instance);
	}

	/**
	 * Removes the instance stored under `name`.
	 *
	 * After this call, `name` can be registered again with a new instance.
	 *
	 * @param name - Identifier of the instance to remove.
	 *
	 * @throws ({@link Exception}) - `name` is not registered.
	 */
	public static unregister(name: string): void {
		if (!this.registry.delete(name))
			throw new Exception(`Instance not registered: ${name}`, {
				key: REGISTRY_ERROR_KEYS.CLASS_INSTANCE_NOT_REGISTERED,
				cause: name
			});
	}

	/**
	 * Retrieves the instance stored under `name`.
	 *
	 * The caller specifies the expected type via the generic parameter;
	 * no runtime type-check is performed.
	 *
	 * @template TClass - Expected type of the stored instance.
	 *
	 * @param name - Identifier of the instance to retrieve.
	 *
	 * @throws ({@link Exception}) - `name` is not registered.
	 */
	public static get<TClass>(name: string): TClass {
		const instance = this.registry.get(name);
		if (!instance)
			throw new Exception(`Instance not registered: ${name}`, {
				key: REGISTRY_ERROR_KEYS.CLASS_INSTANCE_NOT_REGISTERED,
				cause: name
			});
		return instance as TClass;
	}

	/**
	 * Checks whether an instance is stored under `name`.
	 *
	 * @param name - Identifier to look up.
	 */
	public static has(name: string): boolean {
		return this.registry.has(name);
	}

	/** Removes every stored instance — useful for test teardown. */
	public static clear(): void {
		this.registry.clear();
	}
}
