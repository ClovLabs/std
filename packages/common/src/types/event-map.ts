/**
 * Base type for event maps used with {@link TypedEventEmitter}.
 *
 * Each key is an event name, each value the tuple of arguments passed to its listeners.
 *
 * @example
 * ```ts
 * interface MyEvents extends EventMap {
 *   data: [string];
 *   ready: [];
 * }
 * ```
 */
export type EventMap = Record<string | number | symbol, unknown[]>;
