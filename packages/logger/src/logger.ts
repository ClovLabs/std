import { TypedEventEmitter } from '@clov-std/common';
import { Exception } from '@clov-std/error';
import type { BunMessageEvent } from 'bun';

import type { LoggerEvent } from './events/logger-events';
import type { LogLevels } from './types/log-levels';
import type { LoggerSink } from './types/logger-sink';
import type { SinkBodiesIntersection } from './types/sink-bodies-intersection';
import type { SinkMap } from './types/sink-map';
import { workerFunction } from './worker-logger';

/**
 * Configuration options for the {@link Logger} constructor.
 */
export interface LoggerOptions {
	/**
	 * Size in bytes of the ring buffer shared with the worker.
	 * Each log takes a 16-byte header plus its JSON payload. When the ring is full,
	 * the logging call blocks until the worker frees space, so no log is dropped.
	 * A single log cannot exceed half of this size.
	 * @default 4 MiB
	 */
	bufferSize?: number;

	/**
	 * Whether to automatically flush and close the logger when the process exits.
	 * When enabled, hooks are installed on `process.on('beforeExit')` and `process.on('exit')`.
	 * @default true
	 */
	autoEnd?: boolean;
}

export const LOGGER_ERROR_CODES = {
	SINK_DUPLICATE: 'logger.sink.duplicate',
	SINKS_MISSING: 'logger.sinks.missing',
	SINK_WRITE_FAILED: 'logger.sink.write-failed',
	SINK_CLOSE_FAILED: 'logger.sink.close-failed',
	SINK_REGISTRATION_FAILED: 'logger.sink.registration-failed',
	SINK_LIMIT: 'logger.sink.limit',
	LOG_SERIALIZATION_FAILED: 'logger.log.serialization-failed',
	LOG_TOO_LARGE: 'logger.log.too-large'
} as const;

// Ring layout shared with `workerFunction` (see its doc comment).
const HEAD = 0;
const TAIL = 1;
const SLEEPING = 2;
const CONTROL_BYTES = 16;
const HEADER_BYTES = 16;
const WRAP = 0xff_ff_ff_ff;
/** Sink names travel as a 32-bit mask */
const MAX_SINKS = 32;
/** How long the producer parks on a full ring before checking the worker is alive */
const FULL_WAIT_MS = 50;
const LEVEL_INDEX: Record<LogLevels, number> = {
	ERROR: 0,
	WARN: 1,
	INFO: 2,
	DEBUG: 3,
	LOG: 4
};

type WorkerResponseMessage =
	| { type: 'FLUSH_COMPLETE' }
	| { type: 'REGISTER_SINK_ERROR'; sinkName: string; error: Error }
	| { type: 'SINK_LOG_ERROR'; sinkName: string; error: Error; object: unknown }
	| { type: 'SINK_CLOSE_ERROR'; sinkName: string; error: Error }
	| { type: 'CLOSE_COMPLETE' };

export class Logger<
	TSinks extends SinkMap = Record<never, never>
> extends TypedEventEmitter<LoggerEvent> {
	/** List of registered sink keys for quick access */
	private readonly sinkKeys: (keyof TSinks)[] = [];
	/** Worker instance handling log processing */
	private readonly worker: Worker;
	/** Object URL backing the worker module, revoked when the worker is terminated */
	private readonly workerUrl: string;
	/** Size in bytes of the ring's data region */
	private readonly capacity: number;
	/** Ring control slots: head, tail, worker sleeping flag */
	private readonly control: Int32Array;
	/** Ring data region viewed as bytes, 32-bit words and 64-bit floats */
	private readonly bytes: Buffer;
	private readonly words: Uint32Array;
	private readonly floats: Float64Array;
	/** Local copy of the published head (only this thread writes it) */
	private head = 0;
	/** Sink index (bit position in the mask) by sink name */
	private readonly sinkIndexes = new Map<string, number>();
	/** Mask targeting every registered sink */
	private allSinksMask = 0;
	/** Resolvers of flush calls, completed in order by FLUSH_COMPLETE */
	private readonly flushResolvers: (() => void)[] = [];
	/** Resolver for the close promise */
	private closeResolver: (() => void) | null = null;
	/** Pending close, shared by repeated close() calls */
	private closing: Promise<void> | null = null;
	/** Whether the worker has already been terminated (guards double teardown) */
	private workerTerminated = false;
	/** Handle the exit event */
	private readonly handleExit = (): void => {
		this.terminateWorker();
	};
	/** Handle the worker close event */
	private readonly handleWorkerClose = (): void => {
		process.off('beforeExit', this.handleBeforeExit);
		process.off('exit', this.handleExit);
	};

	/**
	 * Creates a new Logger instance with the specified options.
	 *
	 * @param options - Configuration options for the logger
	 */
	public constructor({ autoEnd = true, bufferSize = 4 * 1024 * 1024 }: LoggerOptions = {}) {
		super();
		this.workerUrl = URL.createObjectURL(
			new Blob([`(${workerFunction.toString()})()`], { type: 'application/javascript' })
		);
		this.worker = new Worker(this.workerUrl, { type: 'module' }); // create a new worker
		this.capacity = bufferSize & ~7; // records are 8-byte aligned
		const buffer = new SharedArrayBuffer(CONTROL_BYTES + this.capacity);
		this.control = new Int32Array(buffer, 0, 4);
		this.bytes = Buffer.from(buffer, CONTROL_BYTES, this.capacity);
		this.words = new Uint32Array(buffer, CONTROL_BYTES);
		this.floats = new Float64Array(buffer, CONTROL_BYTES);
		this.worker.postMessage({ type: 'INIT', buffer });
		this.setupWorkerMessages(); // setup message handling from the worker
		if (autoEnd) this.setupAutoEnd(); // setup auto-end on process exit
	}

	/**
	 * Registers a new sink (logging destination) with the logger.
	 *
	 * The factory is serialized and re-evaluated inside the worker, so its body must
	 * be self-contained (no module-scoped imports captured by closure).
	 *
	 * @param sinkName - The name of the sink
	 * @param sinkFactory - The factory building the sink
	 * @param sinkArgs - The factory arguments
	 *
	 * @returns The logger instance with new type (for chaining)
	 */
	public registerSink<
		TSinkName extends string,
		TSink extends LoggerSink,
		TSinkArgs extends unknown[]
	>(
		sinkName: TSinkName,
		sinkFactory: (...args: TSinkArgs) => TSink,
		...sinkArgs: TSinkArgs
	): Logger<TSinks & Record<TSinkName, (...args: TSinkArgs) => TSink>> {
		if (this.sinkIndexes.has(sinkName))
			throw new Exception('Sink is already registered', {
				code: LOGGER_ERROR_CODES.SINK_DUPLICATE,
				cause: { sinkName }
			});
		const sinkIndex = this.sinkKeys.length;
		if (sinkIndex >= MAX_SINKS)
			throw new Exception('Too many sinks registered', {
				code: LOGGER_ERROR_CODES.SINK_LIMIT,
				cause: { sinkName, max: MAX_SINKS }
			});
		this.worker.postMessage({
			type: 'REGISTER_SINK',
			sinkIndex,
			sinkName,
			sinkFactoryString: sinkFactory.toString(),
			sinkArgs
		});
		this.sinkKeys.push(sinkName);
		this.sinkIndexes.set(sinkName, sinkIndex);
		this.allSinksMask = (this.allSinksMask | (1 << sinkIndex)) >>> 0;
		return this;
	}

	/**
	 * Logs a message at the ERROR level to the specified sinks.
	 *
	 * @param object - The log message object
	 * @param sinkNames - Optional array of sink names to log to; logs to all sinks if omitted
	 */
	public error<SNames extends (keyof TSinks)[] = (keyof TSinks)[]>(
		object: SinkBodiesIntersection<TSinks, SNames[number]>,
		sinkNames: SNames = this.sinkKeys as SNames
	): void {
		this.enqueue('ERROR', object, sinkNames);
	}

	/**
	 * Logs a message at the WARN level to the specified sinks.
	 *
	 * @param object - The log message object
	 * @param sinkNames - Optional array of sink names to log to; logs to all sinks if omitted
	 */
	public warn<SNames extends (keyof TSinks)[] = (keyof TSinks)[]>(
		object: SinkBodiesIntersection<TSinks, SNames[number]>,
		sinkNames: SNames = this.sinkKeys as SNames
	): void {
		this.enqueue('WARN', object, sinkNames);
	}

	/**
	 * Logs a message at the INFO level to the specified sinks.
	 *
	 * @param object - The log message object
	 * @param sinkNames - Optional array of sink names to log to; logs to all sinks if omitted
	 */
	public info<SNames extends (keyof TSinks)[] = (keyof TSinks)[]>(
		object: SinkBodiesIntersection<TSinks, SNames[number]>,
		sinkNames: SNames = this.sinkKeys as SNames
	): void {
		this.enqueue('INFO', object, sinkNames);
	}

	/**
	 * Logs a message at the DEBUG level to the specified sinks.
	 *
	 * @param object - The log message object
	 * @param sinkNames - Optional array of sink names to log to; logs to all sinks if omitted
	 */
	public debug<SNames extends (keyof TSinks)[] = (keyof TSinks)[]>(
		object: SinkBodiesIntersection<TSinks, SNames[number]>,
		sinkNames: SNames = this.sinkKeys as SNames
	): void {
		this.enqueue('DEBUG', object, sinkNames);
	}

	/**
	 * Logs a message at the LOG level to the specified sinks.
	 *
	 * @param object - The log message object
	 * @param sinkNames - Optional array of sink names to log to; logs to all sinks if omitted
	 */
	public log<SNames extends (keyof TSinks)[] = (keyof TSinks)[]>(
		object: SinkBodiesIntersection<TSinks, SNames[number]>,
		sinkNames: SNames = this.sinkKeys as SNames
	): void {
		this.enqueue('LOG', object, sinkNames);
	}

	/**
	 * Flushes all pending logs and the sinks' buffers, and waits for completion.
	 */
	public flush(): Promise<void> {
		if (this.workerTerminated) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.flushResolvers.push(resolve);
			this.worker.postMessage({ type: 'FLUSH' });
		});
	}

	/**
	 * Closes the logger, flushes pending logs, and releases resources.
	 */
	public close(): Promise<void> {
		this.closing ??= new Promise<void>((resolve) => {
			this.closeResolver = resolve;
			this.worker.postMessage({ type: 'CLOSE' });
		});
		return this.closing;
	}

	/**
	 * Serializes a log entry straight into the shared ring and wakes the worker if it sleeps.
	 *
	 * @param level - The log level
	 * @param object - The log message object
	 * @param sinkNames - The target sinks (`sinkKeys` itself means all of them)
	 */
	private enqueue<TLogObject>(
		level: LogLevels,
		object: TLogObject,
		sinkNames: (keyof TSinks)[]
	): void {
		if (this.sinkKeys.length === 0)
			throw new Exception('No sinks provided', {
				code: LOGGER_ERROR_CODES.SINKS_MISSING,
				cause: { level, object }
			});

		let json: string | undefined;
		try {
			// The lib types omit it, but `undefined` (or a function) stringifies to `undefined`.
			json = JSON.stringify(object) as string | undefined;
		} catch (error) {
			throw new Exception('Failed to serialize log', {
				code: LOGGER_ERROR_CODES.LOG_SERIALIZATION_FAILED,
				cause: { level, object, error }
			});
		}

		// Worst case is 3 bytes per UTF-16 unit; measure exactly only when that is too pessimistic.
		let maxBytes = json === undefined ? 0 : json.length * 3;
		if (HEADER_BYTES + maxBytes >= this.capacity / 2 && json !== undefined)
			maxBytes = Buffer.byteLength(json);
		const reserved = (HEADER_BYTES + maxBytes + 7) & ~7;
		if (reserved >= this.capacity / 2)
			throw new Exception('Log is larger than half the buffer', {
				code: LOGGER_ERROR_CODES.LOG_TOO_LARGE,
				cause: { level, bytes: maxBytes, bufferSize: this.capacity }
			});

		const position = this.reserve(reserved);
		if (position === -1) return; // worker is gone, nothing can consume the log

		const written =
			json === undefined
				? 0
				: this.bytes.write(json, position + HEADER_BYTES, maxBytes, 'utf8');
		const word = position >>> 2;
		this.words[word] = (written | (LEVEL_INDEX[level] << 28)) >>> 0;
		this.words[word + 1] = this.toMask(sinkNames);
		this.floats[(position >>> 3) + 1] = Date.now();

		this.head = position + ((HEADER_BYTES + written + 7) & ~7);
		Atomics.store(this.control, HEAD, this.head);
		this.wakeWorker();
	}

	/**
	 * Finds a contiguous free slot of `size` bytes, wrapping or parking until the worker frees one.
	 *
	 * @returns The byte offset of the slot, or `-1` if the worker was terminated.
	 */
	private reserve(size: number): number {
		for (;;) {
			const tail = Atomics.load(this.control, TAIL);
			const { head } = this;
			// `head` must never land on `tail` after a write, which would read as empty.
			if (tail <= head) {
				if (head + size < this.capacity) return head;
				if (tail > size) {
					this.words[head >>> 2] = WRAP; // published with the next head store
					return 0;
				}
			} else if (head + size < tail) return head;

			if (this.workerTerminated) return -1;
			this.wakeWorker();
			Atomics.wait(this.control, TAIL, tail, FULL_WAIT_MS);
		}
	}

	/**
	 * Notifies the worker only when it is parked, so a busy worker costs no syscall.
	 */
	private wakeWorker(): void {
		if (
			Atomics.load(this.control, SLEEPING) === 1 &&
			Atomics.exchange(this.control, SLEEPING, 0) === 1
		)
			Atomics.notify(this.control, HEAD);
	}

	/**
	 * Converts target sink names into the bit mask stored in the record header.
	 */
	private toMask(sinkNames: (keyof TSinks)[]): number {
		if (sinkNames === this.sinkKeys) return this.allSinksMask;
		let mask = 0;
		for (const sinkName of sinkNames) {
			const index = this.sinkIndexes.get(sinkName as string);
			if (index !== undefined) mask |= 1 << index;
		}
		return mask >>> 0;
	}

	/**
	 * Sets up message handling for the worker.
	 */
	private setupWorkerMessages(): void {
		this.worker.addEventListener('message', (event: BunMessageEvent<WorkerResponseMessage>) => {
			switch (event.data.type) {
				case 'FLUSH_COMPLETE':
					this.flushResolvers.shift()?.();
					break;

				case 'SINK_LOG_ERROR':
					this.emit(
						'sinkError',
						new Exception('Sink failed to log message', {
							code: LOGGER_ERROR_CODES.SINK_WRITE_FAILED,
							cause: {
								sinkName: event.data.sinkName,
								object: event.data.object,
								error: event.data.error
							}
						})
					);
					break;

				case 'SINK_CLOSE_ERROR':
					this.emit(
						'sinkError',
						new Exception('Sink failed to close', {
							code: LOGGER_ERROR_CODES.SINK_CLOSE_FAILED,
							cause: { sinkName: event.data.sinkName, error: event.data.error }
						})
					);
					break;

				case 'REGISTER_SINK_ERROR':
					this.emit(
						'registerSinkError',
						new Exception('Failed to register sink', {
							code: LOGGER_ERROR_CODES.SINK_REGISTRATION_FAILED,
							cause: { sinkName: event.data.sinkName, error: event.data.error }
						})
					);
					break;

				case 'CLOSE_COMPLETE':
					this.terminateWorker();
					if (this.closeResolver) {
						this.closeResolver();
						this.closeResolver = null;
					}
					break;
				default:
					break;
			}
		});
	}

	/**
	 * Terminates the worker and releases the object URL backing its module.
	 * Idempotent: safe to call from both the close handshake and process exit.
	 */
	private terminateWorker(): void {
		if (this.workerTerminated) return;
		this.workerTerminated = true;
		this.worker.terminate();
		URL.revokeObjectURL(this.workerUrl);
		// A FLUSH queued behind CLOSE never gets its answer; nothing is left to flush anyway.
		for (const resolve of this.flushResolvers.splice(0)) resolve();
	}

	/**
	 * Sets up automatic closing (which flushes) of the logger on process exit.
	 */
	private setupAutoEnd(): void {
		process.on('beforeExit', this.handleBeforeExit);
		process.on('exit', this.handleExit);
		this.worker.addEventListener('close', this.handleWorkerClose);
	}

	/**
	 * Handles the beforeExit event.
	 */
	private readonly handleBeforeExit = (): void => {
		void this.close();
	};
}
