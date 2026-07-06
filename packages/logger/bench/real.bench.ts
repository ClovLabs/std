/* eslint-disable camelcase */
import { createWriteStream, unlinkSync } from 'fs';
import { barplot, bench, do_not_optimize, group, run, summary } from 'mitata';
import pino from 'pino';

import { Logger } from '#/logger';
import { devNullSink } from '#/sinks/devnull-logger';
import { fileSink } from '#/sinks/file-logger';
import type { LogLevels } from '#/types/log-levels';
import type { LoggerSink } from '#/types/logger-sink';

const ITERATIONS = 10_000;

const NOWARA_LOG_FILE = '/tmp/nowara-real-bench.log';
const PINO_LOG_FILE = '/tmp/pino-real-bench.log';
const cleanup = (): void => {
	for (const file of [NOWARA_LOG_FILE, PINO_LOG_FILE])
		try {
			unlinkSync(file);
		} catch {
			// ignore
		}
};
cleanup();

/**
 * Sink qui sérialise le log en JSON (comme fileSink) puis discard le résultat,
 * sans aucune écriture disque. Permet de comparer équitablement l'overhead de
 * sérialisation + dispatch contre pino qui sérialise toujours (même vers /dev/null).
 *
 * important: ce sink tourne dans le worker et est recréé via `new Function(...)`,
 * il ne doit donc référencer AUCUN binding de closure (pas de `do_not_optimize`,
 * pas de variable module). La mutation de `state.last` est un effet de bord
 * autosuffisant que l'optimiseur ne peut pas éliminer.
 */
const jsonDiscardSink = <TLogObject = unknown>(): LoggerSink<TLogObject> => {
	const state = { last: '' };
	return {
		log(level: LogLevels, timestamp: number, object: TLogObject): void {
			state.last = JSON.stringify({ timestamp, level, content: object }) + '\n';
		}
	};
};

// --- Loggers SANS I/O (sérialisation JSON des deux côtés, aucune écriture) ---
const nowaraJsonDiscardLogger = new Logger({ batchTimeout: 10 }).registerSink(
	'json-discard',
	jsonDiscardSink
);

const pinoDevNullStreamLogger = pino(createWriteStream('/dev/null'));
const pinoDevNullMinLengthLogger = pino(pino.destination({ dest: '/dev/null', minLength: 4096 }));
const pinoDevNullDestLogger = pino(pino.destination('/dev/null'));

const flushPino = (logger: pino.Logger): Promise<void> =>
	new Promise((resolve) => {
		logger.flush(() => {
			resolve();
		});
	});

// --- Loggers AVEC I/O (écriture réelle vers un fichier) ---
const nowaraFileLogger = new Logger({ batchTimeout: 10 }).registerSink(
	'file',
	fileSink,
	NOWARA_LOG_FILE
);
const pinoFileLogger = pino(pino.destination(PINO_LOG_FILE));

// --- Loggers DevNull (overhead pur du dispatch, sans sérialisation) ---
const nowaraDevNullLogger = new Logger({ batchTimeout: 10 }).registerSink('devnull', devNullSink);

barplot(() => {
	summary(() =>
		group(
			`🎯 [${ITERATIONS}] - Nowara vs Pino (SANS I/O, sérialisation JSON équitable)`,
			() => {
				bench('Nowara Logger (JSON serialize + discard, worker)', async () => {
					for (let i = 0; i < ITERATIONS; ++i)
						do_not_optimize(
							nowaraJsonDiscardLogger.info('Hello world', ['json-discard'])
						);
					await nowaraJsonDiscardLogger.flush();
				}).gc('inner');

				bench('Pino (Node Stream -> /dev/null)', async () => {
					for (let i = 0; i < ITERATIONS; ++i)
						do_not_optimize(pinoDevNullStreamLogger.info('Hello world'));
					await flushPino(pinoDevNullStreamLogger);
				}).gc('inner');

				bench('Pino (Min Length -> /dev/null)', async () => {
					for (let i = 0; i < ITERATIONS; ++i)
						do_not_optimize(pinoDevNullMinLengthLogger.info('Hello world'));
					await flushPino(pinoDevNullMinLengthLogger);
				}).gc('inner');

				bench('Pino (Destination -> /dev/null)', async () => {
					for (let i = 0; i < ITERATIONS; ++i)
						do_not_optimize(pinoDevNullDestLogger.info('Hello world'));
					await flushPino(pinoDevNullDestLogger);
				}).gc('inner');
			}
		)
	);

	summary(() =>
		group(`📝 [${ITERATIONS}] - Nowara vs Pino (AVEC I/O réel vers fichier)`, () => {
			bench('Nowara Logger (fileSink -> /tmp file, worker)', async () => {
				for (let i = 0; i < ITERATIONS; ++i)
					do_not_optimize(nowaraFileLogger.info('Hello world', ['file']));
				await nowaraFileLogger.flush();
			}).gc('inner');

			bench('Pino (Destination -> /tmp file)', async () => {
				for (let i = 0; i < ITERATIONS; ++i)
					do_not_optimize(pinoFileLogger.info('Hello world'));
				await flushPino(pinoFileLogger);
			}).gc('inner');
		})
	);

	// Référence: overhead pur du dispatch Nowara sans aucune sérialisation (DevNull)
	summary(() =>
		group(
			`⚡ [${ITERATIONS}] - Nowara overhead de dispatch (DevNull, sans sérialisation)`,
			() => {
				bench('Nowara Logger (devNullSink, worker)', async () => {
					for (let i = 0; i < ITERATIONS; ++i)
						do_not_optimize(nowaraDevNullLogger.info('Hello world', ['devnull']));
					await nowaraDevNullLogger.flush();
				}).gc('inner');
			}
		)
	);
});

await run({
	colors: true
});

await nowaraJsonDiscardLogger.flush();
await nowaraFileLogger.flush();
await flushPino(pinoDevNullStreamLogger);
await flushPino(pinoDevNullMinLengthLogger);
await flushPino(pinoDevNullDestLogger);
await flushPino(pinoFileLogger);

cleanup();

console.log('\n✅ Benchmarks completed');
process.exit(0);
