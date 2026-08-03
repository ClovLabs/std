import { describe, expect, test } from 'bun:test';

import { Exception } from '#/exception';
import { HttpException } from '#/http-exception';

describe.concurrent('HttpException', (): void => {
	test('should be an instance of Error, Exception and HttpException', (): void => {
		const error = new HttpException('missing', { status: 'NOT_FOUND' });

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(Exception);
		expect(error).toBeInstanceOf(HttpException);
	});

	test('should resolve status from a key name', (): void => {
		expect(new HttpException('missing', { status: 'NOT_FOUND' }).status).toBe(404);
		expect(new HttpException('nope', { status: 'CONFLICT' }).status).toBe(409);
		expect(new HttpException('boom', { status: 'INTERNAL_SERVER_ERROR' }).status).toBe(500);
	});

	test('should keep a numeric status as-is', (): void => {
		expect(new HttpException('missing', { status: 404 }).status).toBe(404);
		expect(new HttpException('teapot', { status: 418 }).status).toBe(418);
	});

	test('should inherit code from the base exception', (): void => {
		const error = new HttpException('account is gone', {
			status: 404,
			code: 'auth.account.not-found'
		});

		expect(error.code).toBe('auth.account.not-found');
	});

	test('should have undefined code when not provided', (): void => {
		const error = new HttpException('missing', { status: 404 });

		expect(error.code).toBeUndefined();
	});

	test('should store message and cause', (): void => {
		const cause = new Error('root');
		const error = new HttpException('upstream refused', { status: 502, cause });

		expect(error.message).toBe('upstream refused');
		expect(error.cause).toBe(cause);
	});

	test('should set name to the actual class name via new.target', (): void => {
		class NotFoundException extends HttpException {
			public constructor() {
				super('missing', { status: 'NOT_FOUND', code: 'request.route.not-found' });
			}
		}

		expect(new HttpException('a', { status: 404 }).name).toBe('HttpException');
		expect(new NotFoundException().name).toBe('NotFoundException');
		expect(new NotFoundException().status).toBe(404);
	});

	test('should be catchable with instanceof after throw', (): void => {
		expect((): void => {
			throw new HttpException('thrown', { status: 400 });
		}).toThrow(HttpException);
	});
});
