/**
 * Base type for event maps used with {@link TypedEventEmitter}.
 *
 * Each key is an event name and the value is a tuple representing the
 * arguments passed to the listeners of that event.
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
