import { describe, expect, test } from 'bun:test';

import { entry } from '#/entry';
import { defineExceptionCatalog } from '#/exception/define-exception-catalog';
import { LocalizedHttpException } from '#/exception/localized-http-exception';
import { resolveMessage } from '#/resolve-message';

describe.concurrent('defineExceptionCatalog', (): void => {
	test('should return an object with factory functions for each definition', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				simple: entry({
					status: 'NOT_FOUND',
					translations: { en: 'Not found' }
				})
			}
		});

		expect(typeof catalog.simple).toBe('function');
	});

	test('should produce a LocalizedHttpException from a no-param entry', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				simple: entry({
					status: 'NOT_FOUND',
					translations: { en: 'Not found', fr: 'Introuvable' }
				})
			}
		});

		const error = catalog.simple();

		expect(error).toBeInstanceOf(LocalizedHttpException);
		expect(error.message).toBe('Not found');
		expect(error.httpStatusCode).toBe(404);
	});

	test('should set key to the definition key', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				simple: entry({
					status: 'NOT_FOUND',
					translations: { en: 'Not found' }
				})
			}
		});

		expect(catalog.simple().key).toBe('simple');
	});

	test('should not interpolate params in the exception message', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				withParams: entry({
					status: 'BAD_REQUEST',
					translations: { en: 'Invalid id: {{id}}' }
				})
			}
		});

		expect(catalog.withParams({ id: '42' }).message).toBe('Invalid id: {{id}}');
	});

	test('should not interpolate multiple params in the exception message', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				range: entry({
					status: 'BAD_REQUEST',
					translations: { en: 'Value must be between {{min}} and {{max}}' }
				})
			}
		});

		expect(catalog.range({ min: '1', max: '100' }).message).toBe(
			'Value must be between {{min}} and {{max}}'
		);
	});

	test('should allow resolving the exception to a different locale', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				withParams: entry({
					status: 'BAD_REQUEST',
					translations: {
						en: 'Invalid id: {{id}}',
						fr: 'Identifiant invalide : {{id}}'
					}
				})
			}
		});

		const error = catalog.withParams({ id: '42' });

		expect(resolveMessage(error, 'fr')).toBe('Identifiant invalide : 42');
	});

	test('should store the correct defaultLocale', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'fr',
			definitions: {
				msg: entry({
					status: 'OK',
					translations: { en: 'OK', fr: 'OK' }
				})
			}
		});

		expect(catalog.msg().defaultLocale).toBe('fr');
	});

	test('should store translations on the exception', (): void => {
		const translations = { en: 'Not found', fr: 'Introuvable' } as const;
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				simple: entry({ status: 'NOT_FOUND', translations })
			}
		});

		expect(catalog.simple().translations).toEqual(translations);
	});

	test('each invocation should produce a distinct exception instance', (): void => {
		const catalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				simple: entry({
					status: 'NOT_FOUND',
					translations: { en: 'Not found' }
				})
			}
		});

		const a = catalog.simple();
		const b = catalog.simple();

		expect(a).not.toBe(b);
		expect(a.uuid).not.toBe(b.uuid);
	});

	test('should key each catalog independently by definition name', (): void => {
		const authCatalog = defineExceptionCatalog({
			defaultLocale: 'en',
			definitions: {
				denied: entry({
					status: 'FORBIDDEN',
					translations: { en: 'Access denied' }
				})
			}
		});

		expect(authCatalog.denied().key).toBe('denied');
	});
});
