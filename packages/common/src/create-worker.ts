export const createWorker = <const TArgs extends readonly unknown[]>(
	fn: (...args: TArgs) => unknown,
	...args: TArgs
): Worker => {
	const source = `(${fn.toString()})(...${JSON.stringify(args)})`;
	return new Worker(`data:application/javascript,${encodeURIComponent(source)}`, {
		type: 'module'
	});
};
