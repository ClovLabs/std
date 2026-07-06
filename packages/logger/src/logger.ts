import { TypedEventEmitter } from '@dws-std/common';
import { Exception } from '@dws-std/error';
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
	 * Maximum number of log messages that can be queued in memory before dropping new logs.
	 * @default 10_000
	 */
	maxPendingLogs?: number;

	/**
	 * Maximum number of messages that can be sent to the worker without acknowledgment.
	 * Controls backpressure to prevent overwhelming the worker thread.
	 * @default 100
	 */
	maxMessagesInFlight?: number;

	/**
	 * Maximum number of logs to batch together before sending to the worker.
	 * Higher values = better throughput but higher latency.
	 * @default 100
	 */
	batchSize?: number;

	/**
	 * Maximum time in milliseconds to wait before flushing a partial batch.
	 * Prevents logs from being delayed indefinitely when batch size is not reached.
	 * Set to 0 to disable time-based flushing.
	 * @default 0.1 (milliseconds)
	 */
	batchTimeout?: number;

	/**
	 * Whether to automatically flush and close the logger when the process exits.
	 * When enabled, hooks are installed on `process.on('beforeExit')` and `process.on('exit')`.
	 * @default true
	 */
	autoEnd?: boolean;

	/**
	 * Whether to flush pending logs before the process exits.
	 * Only applies when `autoEnd` is true.
	 * @default true
	 */
	flushOnBeforeExit?: boolean;
}

export const LOGGER_ERROR_KEYS = {
	SINK_ALREADY_ADDED: 'logger.sink-already-added',
	NO_SINKS_PROVIDED: 'logger.no-sinks-provided',
	SINK_LOG_ERROR: 'logger.sink-log-error',
	SINK_CLOSE_ERROR: 'logger.sink-close-error',
	REGISTER_SINK_ERROR: 'logger.register-sink-error',
	BEFORE_EXIT_FLUSH_ERROR: 'logger.before-exit-flush-error',
	BEFORE_EXIT_CLOSE_ERROR: 'logger.before-exit-close-error'
} as const;

/**
 * Pending log message corresponding to a log entry waiting to be processed by the worker.
 */
interface PendingLogMessage {
	readonly sinkNames: string[];
	readonly level: LogLevels;
	readonly timestamp: number;
	readonly object: unknown;
}

type WorkerResponseMessage =
	| { type: 'BATCH_COMPLETE' }
	| { type: 'FLUSH_COMPLETE' }
	| { type: 'REGISTER_SINK_ERROR'; sinkName: string; error: Error }
	| { type: 'SINK_LOG_ERROR'; sinkName: string; error: Error; object: unknown }
	| { type: 'SINK_CLOSE_ERROR'; sinkName: string; error: Error }
	| { type: 'CLOSE_COMPLETE' };

export class Logger<
	TSinks extends SinkMap = Record<never, never>
> extends TypedEventEmitter<LoggerEvent> {
	/** Map of registered sinks (logging destinations) */
	private readonly sinks: TSinks;
	/** List of registered sink keys for quick access */
	private readonly sinkKeys: (keyof TSinks)[] = [];
	/** Worker instance handling log processing */
	private readonly worker: Worker;
	/** Object URL backing the worker module, revoked once the worker has loaded */
	private readonly workerUrl: string;
	/** Maximum number of pending log messages allowed in the queue */
	private readonly maxPendingLogs: number;
	/** Maximum number of messages in flight to the worker */
	private readonly maxMessagesInFlight: number;
	/** Number of logs to batch before sending to worker */
	private readonly batchSize: number;
	/** Timeout in milliseconds before flushing incomplete batch */
	private readonly batchTimeout: number;
	/** Whether to auto flush and close on process exit */
	private readonly autoEnd: boolean;
	/** Whether to flush before process exit */
	private readonly flushOnBeforeExit: boolean;

	/** Backing buffer of pending log messages (consumed from {@link pendingHead}) */
	private readonly pendingLogs: PendingLogMessage[] = [];
	/** Index of the first not-yet-dispatched entry in {@link pendingLogs} */
	private pendingHead = 0;
	/** Number of log messages currently being processed by the worker */
	private messagesInFlight = 0;
	/** Timer for batching log messages */
	private batchTimer: Timer | null = null;
	/** Whether the logger is currently writing log messages to the worker */
	private isWriting = false;
	/** Resolvers for flush promises awaiting the next flush round */
	private readonly flushResolvers: (() => void)[] = [];
	/** Resolvers captured by the flush round currently in flight */
	private readonly flushingResolvers: (() => void)[] = [];
	/** Whether a FLUSH round-trip is currently in flight to the worker */
	private flushPending = false;
	/** Resolver for the close promise */
	private closeResolver: (() => void) | null = null;
	/** Resolver for backpressure when maxMessagesInFlight is reached */
	private backpressureResolver: (() => void) | null = null;
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
	public constructor({
		autoEnd = true,
		batchSize = 100,
		batchTimeout = 0.1,
		flushOnBeforeExit = true,
		maxMessagesInFlight = 100,
		maxPendingLogs = 10_000
	}: LoggerOptions = {}) {
		super();
		this.sinks = {} as TSinks;
		this.maxPendingLogs = maxPendingLogs;
		this.maxMessagesInFlight = maxMessagesInFlight;
		this.batchSize = batchSize;
		this.batchTimeout = batchTimeout;
		this.autoEnd = autoEnd;
		this.flushOnBeforeExit = flushOnBeforeExit;
		this.workerUrl = URL.createObjectURL(
			new Blob([`(${workerFunction.toString()})()`], { type: 'application/javascript' })
		);
		this.worker = new Worker(this.workerUrl, { type: 'module' }); // create a new worker
		this.setupWorkerMessages(); // setup message handling from the worker
		if (this.autoEnd) this.setupAutoEnd(); // setup auto-end on process exit
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
		if (this.sinks[sinkName as keyof TSinks] !== undefined)
			throw new Exception('Sink is already registered', {
				key: LOGGER_ERROR_KEYS.SINK_ALREADY_ADDED,
				cause: { sinkName }
			});
		this.worker.postMessage({
			type: 'REGISTER_SINK',
			sinkName,
			sinkFactoryString: sinkFactory.toString(),
			sinkArgs
		});
		this.sinks[sinkName as keyof TSinks] = sinkFactory as unknown as TSinks[keyof TSinks];
		this.sinkKeys.push(sinkName as keyof TSinks);
		return this as unknown as Logger<TSinks & Record<TSinkName, (...args: TSinkArgs) => TSink>>;
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
	 * Logs a message at the TRACE level to the specified sinks.
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
		return new Promise<void>((resolve) => {
			this.flushResolvers.push(resolve);
			this.tryFlush();
		});
	}

	/**
	 * Closes the logger, flushes pending logs, and releases resources.
	 */
	public async close(): Promise<void> {
		await this.flush();

		return new Promise<void>((resolve) => {
			this.closeResolver = resolve;
			this.worker.postMessage({ type: 'CLOSE' });
		});
	}

	/**
	 * Enqueues a log message to be processed by the worker.
	 *
	 * @param level - The log level
	 * @param object - The log message object
	 * @param sinkNames - Optional array of sink names to log to; logs to all sinks if omitted
	 */
	private enqueue<TLogObject>(
		level: LogLevels,
		object: TLogObject,
		sinkNames?: (keyof TSinks)[]
	): void {
		if (this.sinkKeys.length === 0)
			throw new Exception('No sinks provided', {
				key: LOGGER_ERROR_KEYS.NO_SINKS_PROVIDED,
				cause: { level, object }
			});

		const pendingLength = this.pendingLogs.length - this.pendingHead;
		if (pendingLength >= this.maxPendingLogs) return;

		this.pendingLogs.push({
			sinkNames: (sinkNames ?? this.sinkKeys) as string[],
			level,
			timestamp: Date.now(),
			object
		});

		// If the batch size is reached, trigger immediate processing
		if (pendingLength + 1 >= this.batchSize) {
			if (this.batchTimer !== null) {
				clearTimeout(this.batchTimer);
				this.batchTimer = null;
			}
			this.triggerProcessing();
		} else if (this.batchTimer === null && this.batchTimeout > 0)
			// Otherwise, start a timer if not already started
			this.batchTimer = setTimeout(() => {
				this.batchTimer = null;
				this.triggerProcessing();
			}, this.batchTimeout);
	}

	/**
	 * Triggers processing of pending logs.
	 */
	private triggerProcessing(): void {
		if (this.isWriting) return;
		this.isWriting = true;
		void this.processPendingLogs();
	}

	/**
	 * Processes pending log messages by sending them to the worker in batches.
	 */
	private async processPendingLogs(): Promise<void> {
		while (this.pendingLogs.length - this.pendingHead > 0) {
			if (this.messagesInFlight >= this.maxMessagesInFlight)
				await new Promise<void>((resolve) => {
					this.backpressureResolver = resolve;
				});

			const end = Math.min(this.pendingHead + this.batchSize, this.pendingLogs.length);
			const batch = this.pendingLogs.slice(this.pendingHead, end);
			this.pendingHead = end;
			this.reclaimPending();

			this.messagesInFlight++;
			this.worker.postMessage({
				type: 'LOG_BATCH',
				logs: batch
			});
		}

		this.isWriting = false;
		this.emit('drained');
	}

	/**
	 * Reclaims consumed slots in the pending buffer.
	 * Fully resets the buffer when drained, otherwise compacts only once the consumed
	 * prefix dominates the backing array, keeping dequeue amortized O(1).
	 */
	private reclaimPending(): void {
		if (this.pendingHead === this.pendingLogs.length) {
			this.pendingLogs.length = 0;
			this.pendingHead = 0;
		} else if (
			this.pendingHead > this.batchSize &&
			this.pendingHead * 2 >= this.pendingLogs.length
		) {
			this.pendingLogs.splice(0, this.pendingHead);
			this.pendingHead = 0;
		}
	}

	/**
	 * Releases a batch by decrementing the in-flight counter and resolving backpressure if needed.
	 */
	private releaseBatch(): void {
		this.messagesInFlight--;

		if (this.backpressureResolver !== null) {
			this.backpressureResolver();
			this.backpressureResolver = null;
		}
	}

	/**
	 * Advances the flush state machine: drains pending logs, then asks the worker to
	 * flush the sinks' buffers once everything has been dispatched and acknowledged.
	 */
	private tryFlush(): void {
		if (this.flushResolvers.length === 0) return;

		// Drain queued logs first; the flush round is armed once they're acknowledged.
		if (this.pendingLogs.length - this.pendingHead > 0) {
			if (!this.isWriting) {
				this.isWriting = true;
				void this.processPendingLogs();
			}
			return;
		}

		// Everything dispatched and acknowledged → flush the sinks' buffers.
		if (this.messagesInFlight === 0 && !this.flushPending) {
			this.flushPending = true;
			this.flushingResolvers.push(...this.flushResolvers);
			this.flushResolvers.length = 0;
			this.worker.postMessage({ type: 'FLUSH' });
		}
	}

	/**
	 * Sets up message handling for the worker.
	 */
	private setupWorkerMessages(): void {
		this.worker.addEventListener('message', (event: BunMessageEvent<WorkerResponseMessage>) => {
			switch (event.data.type) {
				case 'BATCH_COMPLETE':
					this.releaseBatch();
					this.tryFlush();
					break;

				case 'FLUSH_COMPLETE': {
					this.flushPending = false;
					const resolvers = this.flushingResolvers.splice(
						0,
						this.flushingResolvers.length
					);
					for (const resolve of resolvers) resolve();
					// Re-arm if new flushes were requested during the round-trip.
					this.tryFlush();
					break;
				}

				case 'SINK_LOG_ERROR':
					this.emit(
						'sinkError',
						new Exception('Sink failed to log message', {
							key: LOGGER_ERROR_KEYS.SINK_LOG_ERROR,
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
							key: LOGGER_ERROR_KEYS.SINK_CLOSE_ERROR,
							cause: { sinkName: event.data.sinkName, error: event.data.error }
						})
					);
					break;

				case 'REGISTER_SINK_ERROR':
					this.emit(
						'registerSinkError',
						new Exception('Failed to register sink', {
							key: LOGGER_ERROR_KEYS.REGISTER_SINK_ERROR,
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
	}

	/**
	 * Sets up automatic flushing and closing of the logger on process exit.
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
		if (this.flushOnBeforeExit)
			void this.flush()
				.then(() => this.close())
				.catch((error: unknown) => {
					this.emit(
						'onBeforeExitError',
						new Exception('Failed to flush before exit', {
							key: LOGGER_ERROR_KEYS.BEFORE_EXIT_FLUSH_ERROR,
							cause: { error: error as Error }
						})
					);
				});
		else
			void this.close().catch((error: unknown) => {
				this.emit(
					'onBeforeExitError',
					new Exception('Failed to close before exit', {
						key: LOGGER_ERROR_KEYS.BEFORE_EXIT_CLOSE_ERROR,
						cause: { error: error as Error }
					})
				);
			});
	};
}
