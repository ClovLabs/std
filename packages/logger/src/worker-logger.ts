import type { BunMessageEvent } from 'bun';

import type { LogLevels } from './types/log-levels';
import type { LoggerSink } from './types/logger-sink';

/** `Buffer` with the direct decoders that Node and Bun implement but do not type */
type RingBytes = Buffer & {
	utf8Slice: (start: number, end: number) => string;
	latin1Slice: (start: number, end: number) => string;
};

type WorkerMessage =
	| { type: 'INIT'; buffer: SharedArrayBuffer }
	| {
			type: 'REGISTER_SINK';
			sinkIndex: number;
			sinkName: string;
			sinkFactoryString: string;
			sinkArgs: unknown[];
	  }
	| { type: 'FLUSH' }
	| { type: 'CLOSE' };

/**
 * Worker side of the logger: consumes the shared ring buffer written by the main thread.
 *
 * Ring layout (must match `Logger`): a 16-byte control block of Int32 slots
 * `[head, tail, sleeping, _]`, then the data region. Each record is 8-byte aligned:
 * `u32 (payloadBytes | levelIndex << 28 | ascii << 31)`, `u32 sinkMask`, `f64 timestamp`, then the
 * UTF-8 JSON payload (empty payload = `undefined`). The ASCII bit lets `drain` use `latin1Slice`
 * instead of UTF-8 decoding. `0xFFFFFFFF` marks a wrap to offset 0; it is never a real header
 * (level index 7 does not exist).
 *
 * Everything lives inside this function because it is serialized into the worker.
 */
export const workerFunction = (): void => {
	const HEAD = 0;
	const TAIL = 1;
	const SLEEPING = 2;
	const CONTROL_BYTES = 16;
	const HEADER_BYTES = 16;
	const WRAP = 0xff_ff_ff_ff;
	const ASCII = 0x80_00_00_00;
	const LENGTH_MASK = 0x0f_ff_ff_ff;
	/** Indexed by the header's level index; keep the order of `LEVEL_INDEX` in logger.ts */
	const LEVELS: readonly LogLevels[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'LOG'];
	/**
	 * Empty 1 ms polls before parking. Waking a parked worker costs the producer a syscall,
	 * polling costs the worker a timer: a few polls cover any flow above ~250 logs/s.
	 */
	const IDLE_POLLS = 4;

	const self: Worker = globalThis as unknown as Worker;
	/** Sinks by registration index; `null` when the factory failed */
	const sinks: (LoggerSink | null)[] = [];
	const sinkNames: string[] = [];
	/** Bits of the sink indexes the worker knows about (registered or failed) */
	let knownMask = 0;
	/** Promises of async sinks still running, awaited by FLUSH and CLOSE */
	const pending = new Set<Promise<void>>();
	/** Serializes FLUSH rounds so their completions stay in request order */
	let flushChain: Promise<void> = Promise.resolve();

	const empty = new SharedArrayBuffer(0);
	let control = new Int32Array(empty);
	let words = new Uint32Array(empty);
	let floats = new Float64Array(empty);
	let bytes = Buffer.from(empty) as RingBytes;
	let tail = 0;
	let running = false;
	let closed = false;

	/** Posts an error report; a thrown value that cannot be cloned must not kill the worker. */
	const postError = (message: {
		type: string;
		sinkName: string | undefined;
		error: unknown;
		object?: unknown;
	}): void => {
		try {
			self.postMessage(message);
		} catch {
			// Functions, symbols and the like cannot be cloned: ship their text instead.
			self.postMessage({ ...message, error: new Error(Bun.inspect(message.error)) });
		}
	};

	const reportLogError = (sinkName: string, error: unknown, object: unknown): void => {
		postError({ type: 'SINK_LOG_ERROR', sinkName, error, object });
	};

	/**
	 * Hands one record to its target sinks. `JSON.parse` only runs if a targeted sink
	 * lacks `logJson`, so JSON-native sinks never pay for it.
	 */
	const dispatch = (
		level: LogLevels,
		timestamp: number,
		json: string | undefined,
		mask: number
	): void => {
		let object: unknown;
		let parsed = json === undefined;
		const toObject = (): unknown => {
			if (!parsed) {
				object = JSON.parse(json as string);
				parsed = true;
			}
			return object;
		};
		// Walk the set bits of the mask, lowest sink index first.
		for (let remaining = mask; remaining !== 0; remaining &= remaining - 1) {
			const index = 31 - Math.clz32(remaining & -remaining);
			const sink = sinks[index];
			if (!sink) continue;
			const sinkName = sinkNames[index] as string;
			try {
				const result = sink.logJson
					? sink.logJson(level, timestamp, json)
					: sink.log(level, timestamp, toObject());
				if (result instanceof Promise) {
					const guarded: Promise<void> = result
						.catch((error: unknown) => {
							reportLogError(sinkName, error, toObject());
						})
						.finally(() => {
							pending.delete(guarded);
						});
					pending.add(guarded);
				}
			} catch (error) {
				reportLogError(sinkName, error, toObject());
			}
		}
	};

	/**
	 * Consumes every record published so far.
	 *
	 * @returns `false` when it stopped on a record targeting a sink whose registration
	 * message has not been processed yet (it is already queued, so it resumes then).
	 */
	const drain = (): boolean => {
		const before = tail;
		const head = Atomics.load(control, HEAD);
		let drained = true;
		while (tail !== head) {
			const first = words[tail >>> 2] as number;
			if (first === WRAP) {
				tail = 0;
				continue;
			}
			const mask = words[(tail >>> 2) + 1] as number;
			if ((mask & ~knownMask) !== 0) {
				drained = false;
				break;
			}
			const length = first & LENGTH_MASK;
			const start = tail + HEADER_BYTES;
			let json: string | undefined;
			// An ASCII payload needs no UTF-8 decoding: one byte is one character.
			if (length !== 0)
				json =
					(first & ASCII) === 0
						? bytes.utf8Slice(start, start + length)
						: bytes.latin1Slice(start, start + length);
			dispatch(
				LEVELS[(first >>> 28) & 7] as LogLevels,
				floats[(tail >>> 3) + 1] as number,
				json,
				mask
			);
			tail = start + ((length + 7) & ~7);
			Atomics.store(control, TAIL, tail);
		}
		// Wake the producer if it is blocked on a full ring.
		if (tail !== before) Atomics.notify(control, TAIL);
		return drained;
	};

	/**
	 * Drains, then polls the ring every millisecond; parks only once it stayed
	 * empty for `IDLE_POLLS` polls, so a steady flow of logs never has to wake the worker.
	 */
	const run = async (): Promise<void> => {
		if (running) return;
		running = true;
		let idlePolls = 0;
		for (;;) {
			const before = tail;
			if (closed || !drain()) break;
			if (tail !== before) idlePolls = 0; // consumed something: the flow is still active
			if (Atomics.load(control, HEAD) !== tail) {
				// Published meanwhile: drain again, once messages and microtasks had their turn.
				// oxlint-disable-next-line no-await-in-loop
				await new Promise((resolve) => {
					setImmediate(resolve);
				});
				continue;
			}
			if (idlePolls++ < IDLE_POLLS) {
				// Sequential by design: sleep until the next poll.
				// oxlint-disable-next-line no-await-in-loop
				await new Promise((resolve) => {
					setTimeout(resolve, 1);
				});
				continue;
			}
			idlePolls = 0;
			// Park handshake: the producer stores head, then reads this flag. Raising the flag and
			// then re-reading head means either the worker sees its record or the producer sees the flag and notifies.
			Atomics.store(control, SLEEPING, 1);
			if (Atomics.load(control, HEAD) === tail) {
				// Waits for the flag to still be 1: if the producer already cleared it, this
				// returns at once (`wait.async` is false), so that wake is never lost.
				const wait = Atomics.waitAsync(control, SLEEPING, 1);
				// Sequential by design: park until the producer wakes the worker.
				// oxlint-disable-next-line no-await-in-loop
				if (wait.async) await wait.value;
			}
			Atomics.store(control, SLEEPING, 0);
		}
		running = false;
	};

	/**
	 * Drains the ring, waits for in-flight async logs, then calls `method` on every sink
	 * and waits for it; a failure is reported as `errorType` without stopping the others.
	 */
	const settle = async (
		method: 'flush' | 'close',
		errorType: 'SINK_LOG_ERROR' | 'SINK_CLOSE_ERROR'
	): Promise<void> => {
		// `false` only means records for a sink registered after this call; they were logged
		// after the request, and `run()` resumes them on REGISTER_SINK.
		drain();
		await Promise.all(pending);
		const results: Promise<void>[] = [];
		for (const [index, sink] of sinks.entries()) {
			const report = (error: unknown): void => {
				postError({ type: errorType, sinkName: sinkNames[index], error });
			};
			try {
				const result = sink?.[method]?.();
				if (result instanceof Promise) results.push(result.catch(report));
			} catch (error) {
				report(error);
			}
		}
		await Promise.all(results);
	};

	self.addEventListener('message', (event: BunMessageEvent<WorkerMessage>) => {
		switch (event.data.type) {
			case 'INIT': {
				const { buffer } = event.data;
				control = new Int32Array(buffer, 0, 4);
				words = new Uint32Array(buffer, CONTROL_BYTES);
				floats = new Float64Array(buffer, CONTROL_BYTES);
				bytes = Buffer.from(buffer, CONTROL_BYTES) as RingBytes;
				void run();
				break;
			}
			case 'REGISTER_SINK': {
				const { sinkIndex, sinkName, sinkFactoryString, sinkArgs } = event.data;
				sinkNames[sinkIndex] = sinkName;
				try {
					// Re-evaluate the serialized factory and invoke it with the forwarded args.
					const create = new Function(
						'sinkArgs',
						`return (${sinkFactoryString})(...sinkArgs);`
					) as (args: unknown[]) => LoggerSink;

					sinks[sinkIndex] = create(sinkArgs);
				} catch (error) {
					sinks[sinkIndex] = null;
					postError({ type: 'REGISTER_SINK_ERROR', sinkName, error });
				}
				knownMask |= 1 << sinkIndex;
				// Resume a drain that stopped on this sink.
				void run();
				break;
			}
			case 'FLUSH':
				flushChain = flushChain
					.then(() => settle('flush', 'SINK_LOG_ERROR'))
					.then(() => self.postMessage({ type: 'FLUSH_COMPLETE' }));
				break;
			case 'CLOSE':
				// Flush first: a sink without `close` may still hold buffered writes.
				void flushChain
					.then(() => settle('flush', 'SINK_LOG_ERROR'))
					.then(() => {
						closed = true;
						return settle('close', 'SINK_CLOSE_ERROR');
					})
					.then(() => self.postMessage({ type: 'CLOSE_COMPLETE' }));
				break;
			default:
				break;
		}
	});
};
