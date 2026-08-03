import { describe, expect, test } from 'bun:test';

import { Exception } from '#/exception';

describe.concurrent('Exception', (): void => {
	test('should be an instance of Error and Exception', (): void => {
		const error = new Exception('something broke');

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(Exception);
	});

	test('should store message', (): void => {
		const error = new Exception('database failed');

		expect(error.message).toBe('database failed');
	});

	test('should store cause from init', (): void => {
		const cause = { code: 'DB_TIMEOUT', query: 'SELECT *' };
		const error = new Exception('database failed', { cause });

		expect(error.cause).toBe(cause);
	});

	test('should have undefined cause when not provided', (): void => {
		const error = new Exception('no cause');

		expect(error.cause).toBeUndefined();
	});

	test('should store code from init', (): void => {
		const error = new Exception('not allowed', { code: 'auth.access.denied' });

		expect(error.code).toBe('auth.access.denied');
	});

	test('should have undefined code when not provided', (): void => {
		const error = new Exception('no code');

		expect(error.code).toBeUndefined();
	});

	test('should accept both code and cause together', (): void => {
		const cause = new Error('root');
		const error = new Exception('combined', { code: 'wrapped.root.failed', cause });

		expect(error.code).toBe('wrapped.root.failed');
		expect(error.cause).toBe(cause);
	});

	test('should set name to the actual class name via new.target', (): void => {
		class CustomError extends Exception {}

		expect(new Exception('a').name).toBe('Exception');
		expect(new CustomError('b').name).toBe('CustomError');
	});

	test('should produce a stack trace excluding the constructor frame', (): void => {
		const error = new Exception('stack test');

		expect(error.stack).toBeDefined();
		expect(error.stack).not.toContain('new Exception');
	});

	test('should be catchable with instanceof after throw', (): void => {
		expect((): void => {
			throw new Exception('thrown');
		}).toThrow(Exception);
	});
});
