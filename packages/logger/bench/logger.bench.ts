/* eslint-disable camelcase */
import { mkdtempSync, rmSync } from 'fs';
import { barplot, bench, do_not_optimize, group, run, summary } from 'mitata';
import { tmpdir } from 'os';
import { join } from 'path';
import pino from 'pino';

import { Logger } from '#/logger';
import { fileSink } from '#/sinks/file-logger';

/**
 * Clov vs pino, both writing real files, same payload.
 *
 * - "burst": N logs then wait until they are on disk (flush), i.e. end-to-end throughput.
 * - "per call": what one `info()` costs the caller under sustained load; a full
 *   buffer makes the caller wait for the writer, so this is sustained throughput too.
 * - "spaced": what one `info()` costs the caller when logs come one at a time with
 *   the event loop running in between, the way a server logs its requests. Unlike a
 *   tight loop, the caches are cold and a writer that sleeps between logs must be woken.
 *
 * pino runs without `pid`/`hostname` and with an epoch timestamp, so both write
 * one comparable JSON line per log.
 */

const BURST = 10_000;
const SPACED_LOGS = 50_000;
/** Time between two spaced logs: 100,000 logs per second */
const SPACED_GAP_NS = 10_000;
const dir = mkdtempSync(join(tmpdir(), 'clov-logger-bench-'));

const makeLog = (i: number): Record<string, unknown> => ({
	msg: 'request handled',
	userId: i,
	req: {
		method: 'GET',
		url: `/api/users/${i}`,
		headers: { 'user-agent': 'bench', accept: 'application/json' }
	},
	durationMs: i % 300
});

const pinoOptions: pino.LoggerOptions = { base: null, timestamp: pino.stdTimeFunctions.epochTime };

const clov = new Logger().registerSink('file', fileSink, join(dir, 'clov.log'));
// pino's default destination: one synchronous write per log, on the caller's thread.
const pinoSync = pino(pinoOptions, pino.destination({ dest: join(dir, 'pino-sync.log') }));
// Buffered asynchronous writes, still on the caller's thread.
const pinoAsync = pino(
	pinoOptions,
	pino.destination({ dest: join(dir, 'pino-async.log'), sync: false, minLength: 4096 })
);
// Worker thread fed through a SharedArrayBuffer: the same design as Clov.
const pinoTransport = pino(
	pinoOptions,
	pino.transport({
		target: 'pino/file',
		options: { destination: join(dir, 'pino-transport.log') }
	})
);

const flushPino = (logger: pino.Logger): Promise<void> =>
	new Promise((resolve) => {
		logger.flush(() => {
			resolve();
		});
	});

let i = 0;

barplot(() => {
	summary(() =>
		group(`burst: ${BURST} logs written to disk`, () => {
			bench('Clov (worker, shared memory)', async () => {
				for (let n = 0; n < BURST; ++n) clov.info(makeLog(n));
				await clov.flush();
			}).gc('inner');

			bench('pino (sync destination)', async () => {
				for (let n = 0; n < BURST; ++n) pinoSync.info(makeLog(n));
				await flushPino(pinoSync);
			}).gc('inner');

			bench('pino (async destination)', async () => {
				for (let n = 0; n < BURST; ++n) pinoAsync.info(makeLog(n));
				await flushPino(pinoAsync);
			}).gc('inner');

			bench('pino (transport, worker)', async () => {
				for (let n = 0; n < BURST; ++n) pinoTransport.info(makeLog(n));
				await flushPino(pinoTransport);
			}).gc('inner');
		})
	);

	summary(() =>
		group('per call: one info() under sustained load', () => {
			bench('Clov (worker, shared memory)', () => {
				do_not_optimize(clov.info(makeLog(i++)));
			});

			bench('pino (sync destination)', () => {
				do_not_optimize(pinoSync.info(makeLog(i++)));
			});

			bench('pino (async destination)', () => {
				do_not_optimize(pinoAsync.info(makeLog(i++)));
			});

			bench('pino (transport, worker)', () => {
				do_not_optimize(pinoTransport.info(makeLog(i++)));
			});
		})
	);
});

await run({ colors: true });

/**
 * Logs every `SPACED_GAP_NS`, yielding to the event loop before each log, and times only the
 * log call itself (the object is built before the clock starts). Flushes first, so what the
 * previous benchmarks left in the logger is not measured.
 *
 * @returns The median duration of a call, in nanoseconds
 */
const measureSpaced = async (
	log: (object: Record<string, unknown>) => void,
	flush: () => Promise<void>
): Promise<number> => {
	await flush();
	const durations = new Float64Array(SPACED_LOGS);
	let next = Bun.nanoseconds();
	for (let n = 0; n < SPACED_LOGS; ++n) {
		// Sequential by design: one event loop turn between two logs.
		// oxlint-disable-next-line no-await-in-loop
		await new Promise((resolve) => {
			setImmediate(resolve);
		});
		const object = makeLog(n);
		// A late turn logs at once instead of catching up with a burst.
		next = Math.max(next + SPACED_GAP_NS, Bun.nanoseconds());
		while (Bun.nanoseconds() < next); // spin: a timer is not precise enough for 10 µs
		const start = Bun.nanoseconds();
		log(object);
		durations[n] = Bun.nanoseconds() - start;
	}
	return durations.sort()[SPACED_LOGS >> 1] as number;
};

console.log(
	`\n• spaced: one info() every ${SPACED_GAP_NS / 1000} µs, event loop running in between`
);
for (const [name, log, flush] of [
	['empty call (timer overhead)', (): void => undefined, (): Promise<void> => Promise.resolve()],
	[
		'Clov (worker, shared memory)',
		(object: Record<string, unknown>): void => clov.info(object),
		(): Promise<void> => clov.flush()
	],
	[
		'pino (sync destination)',
		(object: Record<string, unknown>): void => pinoSync.info(object),
		(): Promise<void> => flushPino(pinoSync)
	],
	[
		'pino (async destination)',
		(object: Record<string, unknown>): void => pinoAsync.info(object),
		(): Promise<void> => flushPino(pinoAsync)
	],
	[
		'pino (transport, worker)',
		(object: Record<string, unknown>): void => pinoTransport.info(object),
		(): Promise<void> => flushPino(pinoTransport)
	]
] as const)
	// Sequential by design: one logger measured at a time.
	// oxlint-disable-next-line no-await-in-loop
	console.log(
		`${name.padEnd(30)}${(await measureSpaced(log, flush)).toFixed(0).padStart(6)} ns/call`
	);

await Promise.all([
	clov.close(),
	flushPino(pinoSync),
	flushPino(pinoAsync),
	flushPino(pinoTransport)
]);
rmSync(dir, { recursive: true, force: true });
process.exit(0);
