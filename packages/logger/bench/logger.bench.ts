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
 *
 * pino runs without `pid`/`hostname` and with an epoch timestamp, so both write
 * one comparable JSON line per log.
 */

const BURST = 10_000;
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

await Promise.all([
	clov.close(),
	flushPino(pinoSync),
	flushPino(pinoAsync),
	flushPino(pinoTransport)
]);
rmSync(dir, { recursive: true, force: true });
process.exit(0);
