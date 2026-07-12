import { HttpException } from '@clov-std/error';
import { describe, expect, test } from 'bun:test';

import { LocalizedHttpException } from '#/exception/localized-http-exception';
import { resolveMessage } from '#/resolve-message';

describe.concurrent('LocalizedHttpException', (): void => {
	test('should extend HttpException and Error', (): void => {
		const error = new LocalizedHttpException('ns.key', {
			status: 'NOT_FOUND',
			translations: { en: 'Not found' },
			defaultLocale: 'en'
		});

		expect(error).toBeInstanceOf(LocalizedHttpException);
		expect(error).toBeInstanceOf(HttpException);
		expect(error).toBeInstanceOf(Error);
	});

	test('should set key from the first constructor argument', (): void => {
		const error = new LocalizedHttpException('auth.invalidCredentials', {
			status: 'UNAUTHORIZED',
			translations: { en: 'Unauthorized' },
			defaultLocale: 'en'
		});

		expect(error.key).toBe('auth.invalidCredentials');
	});

	test('should set message to the raw default locale template', (): void => {
		const error = new LocalizedHttpException('ns.key', {
			status: 'BAD_REQUEST',
			translations: { en: 'Bad request', fr: 'Requête invalide' },
			defaultLocale: 'fr'
		});

		expect(error.message).toBe('Requête invalide');
	});

	test('should not interpolate params into the message', (): void => {
		const error = new LocalizedHttpException('dns.invalid', {
			status: 'BAD_REQUEST',
			translations: { en: 'Invalid type: {{type}}' },
			params: { type: 'MX' },
			defaultLocale: 'en'
		});

		expect(error.message).toBe('Invalid type: {{type}}');
	});

	test('should store translations, params, and defaultLocale for later resolution', (): void => {
		const translations = { en: 'Hello {{name}}', de: 'Hallo {{name}}' };
		const params = { name: 'World' };

		const error = new LocalizedHttpException('greet.hello', {
			status: 'OK',
			translations,
			params,
			defaultLocale: 'en'
		});

		expect(error.translations).toBe(translations);
		expect(error.params).toBe(params);
		expect(error.defaultLocale).toBe('en');
	});

	test('should map HTTP status key to correct numeric code', (): void => {
		const error = new LocalizedHttpException('ns.key', {
			status: 'CONFLICT',
			translations: { en: 'Conflict' },
			defaultLocale: 'en'
		});

		expect(error.httpStatusCode).toBe(409);
	});

	test('should accept numeric status code directly', (): void => {
		const error = new LocalizedHttpException('ns.key', {
			status: 422,
			translations: { en: 'Unprocessable' },
			defaultLocale: 'en'
		});

		expect(error.httpStatusCode).toBe(422);
	});

	test('should allow re-resolving to a different locale after construction', (): void => {
		const error = new LocalizedHttpException('dns.ttl', {
			status: 'BAD_REQUEST',
			translations: {
				en: 'TTL between {{min}} and {{max}}',
				es: 'TTL entre {{min}} y {{max}}'
			},
			params: { min: '60', max: '86400' },
			defaultLocale: 'en'
		});

		expect(error.message).toBe('TTL between {{min}} and {{max}}');
		expect(resolveMessage(error)).toBe('TTL between 60 and 86400');
		expect(resolveMessage(error, 'es')).toBe('TTL entre 60 y 86400');
	});

	test('should propagate cause through the chain', (): void => {
		const rootCause = new Error('connection reset');
		const error = new LocalizedHttpException('db.fail', {
			status: 'INTERNAL_SERVER_ERROR',
			translations: { en: 'Database error' },
			defaultLocale: 'en',
			cause: rootCause
		});

		expect(error.cause).toBe(rootCause);
	});

	test('should be catchable with instanceof', (): void => {
		expect((): void => {
			throw new LocalizedHttpException('ns.key', {
				status: 'FORBIDDEN',
				translations: { en: 'Forbidden' },
				defaultLocale: 'en'
			});
		}).toThrow(LocalizedHttpException);
	});

	test('should set name to LocalizedHttpException', (): void => {
		const error = new LocalizedHttpException('ns.key', {
			status: 'OK',
			translations: { en: 'ok' },
			defaultLocale: 'en'
		});

		expect(error.name).toBe('LocalizedHttpException');
	});
});
