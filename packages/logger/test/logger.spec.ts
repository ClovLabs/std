import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { LOGGER_ERROR_CODES, Logger } from '#/logger';
import { fileSink } from '#/sinks/file-logger';

interface TestLog {
	n: number;
	text: string;
}

interface Entry {
	timestamp: number;
	level: string;
	content?: unknown;
}

const dir = mkdtempSync(join(tmpdir(), 'clov-logger-test-'));

afterAll((): void => {
	rmSync(dir, { recursive: true, force: true });
});

const readEntries = (path: string): Entry[] =>
	readFileSync(path, 'utf8')
		.trimEnd()
		.split('\n')
		.map((line): Entry => JSON.parse(line) as Entry);

const codeOf = (action: () => void): string | undefined => {
	try {
		action();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

describe('Logger', (): void => {
	test('should deliver every log in order through a ring far smaller than the flow', async (): Promise<void> => {
		const path = join(dir, 'flow.log');
		const logger = new Logger({ bufferSize: 64 * 1024, autoEnd: false }).registerSink(
			'file',
			fileSink,
			path
		);
		const count = 200_000;
		// One log in 7 is not ASCII, so both payload encodings cross the ring.
		const textOf = (n: number): string => (n % 7 === 0 ? 'héllo 中' : 'hello');

		for (let n = 0; n < count; ++n) logger.info({ n, text: textOf(n) });
		await logger.close();

		const logs = readEntries(path).map((entry) => entry.content as TestLog);
		expect(logs).toHaveLength(count);
		expect(logs.findIndex((log, n) => log.n !== n || log.text !== textOf(n))).toBe(-1);
	});

	test('should keep records intact when varied sizes wrap a small ring', async (): Promise<void> => {
		const path = join(dir, 'wrap.log');
		const logger = new Logger({ bufferSize: 4096, autoEnd: false }).registerSink(
			'file',
			fileSink,
			path
		);
		const count = 3000;
		const textOf = (n: number): string => (n % 5 === 0 ? '中' : 'x').repeat((n * 97) % 500);

		for (let n = 0; n < count; ++n) logger.info({ n, text: textOf(n) });
		await logger.close();

		const logs = readEntries(path).map((entry) => entry.content as TestLog);
		expect(logs).toHaveLength(count);
		expect(logs.findIndex((log, n) => log.n !== n || log.text !== textOf(n))).toBe(-1);
	});

	test('should wake the worker once it has gone idle', async (): Promise<void> => {
		// A failing sink reports each log back, which shows the worker read it without a flush.
		const logger = new Logger({ autoEnd: false }).registerSink('failing', () => ({
			log(): void {
				throw new Error('read');
			}
		}));
		const nextRead = (): Promise<unknown> =>
			new Promise((resolve) => {
				logger.once('sinkError', resolve);
			});

		const first = nextRead();
		logger.info(undefined);
		await first;
		await Bun.sleep(50); // long enough for the worker to stop polling and park
		const second = nextRead();
		logger.info(undefined);
		await second;

		await logger.close();
	});

	test('should keep consuming when a sink throws a value that cannot be cloned', async (): Promise<void> => {
		const logger = new Logger({ autoEnd: false }).registerSink('failing', () => ({
			log(): void {
				// oxlint-disable-next-line no-throw-literal, typescript/only-throw-error
				throw (): void => undefined;
			}
		}));
		const failure = new Promise<unknown>((resolve) => {
			logger.once('sinkError', resolve);
		});

		logger.info(undefined);
		await logger.flush();

		expect(((await failure) as { code?: string }).code).toBe(
			LOGGER_ERROR_CODES.SINK_WRITE_FAILED
		);
		await logger.close();
	});

	test('should keep delivering to healthy sinks when a factory fails', async (): Promise<void> => {
		const path = join(dir, 'healthy.log');
		const logger = new Logger({ autoEnd: false })
			.registerSink('bad', () => {
				throw new Error('boom');
			})
			.registerSink('file', fileSink, path);
		const failure = new Promise<unknown>((resolve) => {
			logger.once('registerSinkError', resolve);
		});

		for (let n = 0; n < 3; ++n) logger.info({ n });
		expect(((await failure) as { code?: string }).code).toBe(
			LOGGER_ERROR_CODES.SINK_REGISTRATION_FAILED
		);
		await logger.close();

		expect(readEntries(path).map((entry) => entry.content)).toEqual([
			{ n: 0 },
			{ n: 1 },
			{ n: 2 }
		]);
	});

	test('should append to a file that already has content', async (): Promise<void> => {
		const path = join(dir, 'append.log');
		writeFileSync(path, '{"old":true}\n');
		const logger = new Logger({ autoEnd: false }).registerSink('file', fileSink, path);

		logger.info({ n: 1 });
		await logger.close();

		const [old, added] = readEntries(path);
		expect(old).toEqual({ old: true } as unknown as Entry);
		expect(added?.content).toEqual({ n: 1 });
	});

	test('should route each log only to the sinks it names', async (): Promise<void> => {
		const a = join(dir, 'route-a.log');
		const b = join(dir, 'route-b.log');
		const logger = new Logger({ autoEnd: false })
			.registerSink('a', fileSink, a)
			.registerSink('b', fileSink, b);

		logger.info({ n: 1 }, ['a']);
		logger.info({ n: 2 }, ['b']);
		logger.info({ n: 3 });
		await logger.close();

		expect(readEntries(a).map((entry) => entry.content)).toEqual([{ n: 1 }, { n: 3 }]);
		expect(readEntries(b).map((entry) => entry.content)).toEqual([{ n: 2 }, { n: 3 }]);
	});

	test('should write a line without content for an undefined payload', async (): Promise<void> => {
		const path = join(dir, 'undefined.log');
		const logger = new Logger({ autoEnd: false }).registerSink('file', fileSink, path);

		logger.info(undefined);
		logger.info({ n: 1 });
		await logger.close();

		const [first, second] = readEntries(path);
		expect(Object.keys(first as Entry)).toEqual(['timestamp', 'level']);
		expect(second?.content).toEqual({ n: 1 });
	});

	test('should throw synchronously on a circular object and write nothing', async (): Promise<void> => {
		const path = join(dir, 'circular.log');
		const logger = new Logger({ autoEnd: false }).registerSink('file', fileSink, path);
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		expect(codeOf(() => logger.info(circular))).toBe(
			LOGGER_ERROR_CODES.LOG_SERIALIZATION_FAILED
		);
		logger.info({ n: 1 });
		await logger.close();

		expect(readEntries(path).map((entry) => entry.content)).toEqual([{ n: 1 }]);
	});

	test('should reject a log at half the ring and stay usable', async (): Promise<void> => {
		const path = join(dir, 'large.log');
		const logger = new Logger({ bufferSize: 4096, autoEnd: false }).registerSink(
			'file',
			fileSink,
			path
		);
		// 2024 JSON bytes + 16 header bytes = 2040 reserved, the largest record accepted
		const big = 'x'.repeat(2022);

		expect(codeOf(() => logger.info('x'.repeat(2023)))).toBe(LOGGER_ERROR_CODES.LOG_TOO_LARGE);
		logger.info(big);
		logger.info('after');
		await logger.close();

		expect(readEntries(path).map((entry) => entry.content)).toEqual([big, 'after']);
	});

	test('should drop logs made after close instead of blocking on a full ring', async (): Promise<void> => {
		const path = join(dir, 'closed.log');
		const logger = new Logger({ bufferSize: 4096, autoEnd: false }).registerSink(
			'file',
			fileSink,
			path
		);

		logger.info({ n: 1 });
		const closing = logger.close();
		for (let n = 0; n < 1000; ++n) logger.info({ n }); // far more than the ring holds
		await closing;

		expect(readEntries(path).map((entry) => entry.content)).toEqual([{ n: 1 }]);
	});
});
