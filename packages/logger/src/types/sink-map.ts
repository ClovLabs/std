import type { LoggerSink } from './logger-sink';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SinkMap = Record<string, (...args: any[]) => LoggerSink<never>>;
