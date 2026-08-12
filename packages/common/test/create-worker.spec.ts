import { describe, expect, test } from 'bun:test';

import { createWorker } from '#/create-worker';

const firstMessage = (worker: Worker): Promise<unknown> =>
	new Promise((resolve, reject) => {
		worker.addEventListener('message', (event: MessageEvent) => {
			worker.terminate();
			resolve(event.data);
		});
		worker.addEventListener('error', (event: ErrorEvent) => {
			worker.terminate();
			reject(new Error(event.message));
		});
	});

describe('createWorker', () => {
	test('runs the function in a worker and forwards its arguments', async () => {
		const worker = createWorker(
			(a: number, b: number) => {
				postMessage(a + b);
			},
			2,
			40
		);

		expect(await firstMessage(worker)).toBe(42);
	});

	test('serializes object arguments', async () => {
		const worker = createWorker(
			(user: { name: string }) => {
				postMessage(`hello ${user.name}`);
			},
			{ name: 'ruby' }
		);

		expect(await firstMessage(worker)).toBe('hello ruby');
	});

	test('resolves bare package specifiers imported inside the function', async () => {
		const worker = createWorker(async () => {
			const { escapeHTML } = await import('bun');
			postMessage(escapeHTML('<b>'));
		});

		expect(await firstMessage(worker)).toBe('&lt;b&gt;');
	});

	test('loses the calling scope', async () => {
		const outer = 'not visible';
		const worker = createWorker(() => {
			try {
				postMessage(eval('outer') as string);
			} catch (error) {
				postMessage(`threw: ${(error as Error).name}`);
			}
		});

		expect(outer).toBe('not visible');
		expect(await firstMessage(worker)).toBe('threw: ReferenceError');
	});
});
