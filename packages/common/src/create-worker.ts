export const createWorker = <const TArgs extends readonly unknown[]>(
	fn: (...args: TArgs) => unknown,
	...args: TArgs
): Worker => {
	const url = URL.createObjectURL(
		new Blob([`(${fn.toString()})(...${JSON.stringify(args)})`], {
			type: 'application/javascript'
		})
	);

	const worker = new Worker(url, { type: 'module' });
	worker.addEventListener('open', () => { URL.revokeObjectURL(url); }, { once: true });

	return worker;
};
