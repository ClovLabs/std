import type { LoggerSink } from './logger-sink';

/**
 * A factory that builds a {@link LoggerSink}.
 *
 * The factory is serialized and re-evaluated inside the logger worker, so its body
 * must be self-contained: it can only rely on its arguments, runtime globals, and
 * dynamic `import()`, never on module-scoped imports captured by closure.
 *
 * @typeParam TLogObject - The shape of the objects this sink accepts.
 * @typeParam TArgs - The factory arguments forwarded from `registerSink`.
 */
export type SinkFactory<
	TLogObject = unknown,
	TArgs extends readonly unknown[] = readonly unknown[]
> = (...args: TArgs) => LoggerSink<TLogObject>;
