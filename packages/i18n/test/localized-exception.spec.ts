import { Exception } from '@clov-std/error';
import { describe, expect, test } from 'bun:test';

import { LocalizedException } from '#/exception/localized-exception';
import { LocalizedHttpException } from '#/exception/localized-http-exception';
import { resolveMessage } from '#/resolve-message';

describe.concurrent('LocalizedException', (): void => {
	test('should extend Exception and Error', (): void => {
		const error = new LocalizedException('job.cancelled', {
			translations: { en: 'Job cancelled' },
			defaultLocale: 'en'
		});

		expect(error).toBeInstanceOf(LocalizedException);
		expect(error).toBeInstanceOf(Exception);
		expect(error).toBeInstanceOf(Error);
	});

	test('should not be an HTTP exception nor carry a status code', (): void => {
		const error = new LocalizedException('job.cancelled', {
			translations: { en: 'Job cancelled' },
			defaultLocale: 'en'
		});

		expect(error).not.toBeInstanceOf(LocalizedHttpException);
		expect('httpStatusCode' in error).toBe(false);
	});

	test('should set key from the first constructor argument', (): void => {
		const error = new LocalizedException('queue.retryExhausted', {
			translations: { en: 'Retries exhausted' },
			defaultLocale: 'en'
		});

		expect(error.key).toBe('queue.retryExhausted');
	});

	test('should set message to the raw default locale template', (): void => {
		const error = new LocalizedException('job.cancelled', {
			translations: { en: 'Job cancelled', fr: 'Tâche annulée' },
			defaultLocale: 'fr'
		});

		expect(error.message).toBe('Tâche annulée');
	});

	test('should not interpolate params into the message', (): void => {
		const error = new LocalizedException('job.failed', {
			translations: { en: 'Job {{id}} failed' },
			params: { id: '42' },
			defaultLocale: 'en'
		});

		expect(error.message).toBe('Job {{id}} failed');
	});

	test('should store translations, params, and defaultLocale for later resolution', (): void => {
		const translations = { en: 'Job {{id}} failed', de: 'Job {{id}} fehlgeschlagen' };
		const params = { id: '42' };

		const error = new LocalizedException('job.failed', {
			translations,
			params,
			defaultLocale: 'en'
		});

		expect(error.translations).toBe(translations);
		expect(error.params).toBe(params);
		expect(error.defaultLocale).toBe('en');
	});

	test('should resolve to any locale after construction', (): void => {
		const error = new LocalizedException('job.failed', {
			translations: { en: 'Job {{id}} failed', es: 'Trabajo {{id}} fallido' },
			params: { id: '42' },
			defaultLocale: 'en'
		});

		expect(resolveMessage(error)).toBe('Job 42 failed');
		expect(resolveMessage(error, 'es')).toBe('Trabajo 42 fallido');
	});

	test('should propagate cause', (): void => {
		const rootCause = new Error('worker died');
		const error = new LocalizedException('job.failed', {
			translations: { en: 'Job failed' },
			defaultLocale: 'en',
			cause: rootCause
		});

		expect(error.cause).toBe(rootCause);
	});

	test('should be catchable with instanceof', (): void => {
		expect((): void => {
			throw new LocalizedException('job.cancelled', {
				translations: { en: 'Job cancelled' },
				defaultLocale: 'en'
			});
		}).toThrow(LocalizedException);
	});

	test('should set name to LocalizedException', (): void => {
		const error = new LocalizedException('job.cancelled', {
			translations: { en: 'Job cancelled' },
			defaultLocale: 'en'
		});

		expect(error.name).toBe('LocalizedException');
	});
});
