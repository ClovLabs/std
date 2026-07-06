import { describe, expect, test } from 'bun:test';

import { entry } from '#/entry';
import { defineMessageCatalog } from '#/message/define-message-catalog';
import { resolveMessage } from '#/resolve-message';

describe.concurrent('defineMessageCatalog', (): void => {
	test('should return an object with factory functions for each definition', (): void => {
		const catalog = defineMessageCatalog({
			defaultLocale: 'en',
			definitions: {
				greet: entry({
					translations: { en: 'Hello', fr: 'Bonjour' }
				})
			}
		});

		expect(typeof catalog.greet).toBe('function');
	});

	test('should produce a LocalizedMessage with correct translations', (): void => {
		const catalog = defineMessageCatalog({
			defaultLocale: 'en',
			definitions: {
				success: entry({
					translations: { en: 'Done', de: 'Fertig' }
				})
			}
		});

		const msg = catalog.success();

		expect(msg.translations).toEqual({ en: 'Done', de: 'Fertig' });
		expect(msg.defaultLocale).toBe('en');
	});

	test('should store params on the resolved message', (): void => {
		const catalog = defineMessageCatalog({
			defaultLocale: 'en',
			definitions: {
				updated: entry({
					translations: {
						en: 'Record for "{{domain}}" updated',
						fr: 'Enregistrement pour "{{domain}}" mis à jour'
					}
				})
			}
		});

		const msg = catalog.updated({ domain: 'example.com' });

		expect(msg.params).toEqual({ domain: 'example.com' });
	});

	test('should resolve a no-param message to the default locale', (): void => {
		const catalog = defineMessageCatalog({
			defaultLocale: 'fr',
			definitions: {
				created: entry({
					translations: { en: 'Created', fr: 'Créé' }
				})
			}
		});

		const msg = catalog.created();

		expect(resolveMessage(msg)).toBe('Créé');
	});

	test('should resolve a parameterized message to a specific locale', (): void => {
		const catalog = defineMessageCatalog({
			defaultLocale: 'en',
			definitions: {
				propagation: entry({
					translations: {
						en: 'Propagation for "{{zone}}" takes ~{{minutes}} min',
						es: 'Propagación de "{{zone}}" tardará ~{{minutes}} min'
					}
				})
			}
		});

		const msg = catalog.propagation({ zone: 'test.io', minutes: '15' });

		expect(resolveMessage(msg, 'es')).toBe('Propagación de "test.io" tardará ~15 min');
	});

	test('each invocation should produce a distinct message object', (): void => {
		const catalog = defineMessageCatalog({
			defaultLocale: 'en',
			definitions: {
				msg: entry({
					translations: { en: 'Same' }
				})
			}
		});

		const a = catalog.msg();
		const b = catalog.msg();

		expect(a).not.toBe(b);
		expect(a).toEqual(b);
	});

	test('should handle multiple definitions in the same catalog', (): void => {
		const catalog = defineMessageCatalog({
			defaultLocale: 'en',
			definitions: {
				first: entry({ translations: { en: 'First' } }),
				second: entry({ translations: { en: 'Second' } }),
				third: entry({ translations: { en: 'Third' } })
			}
		});

		expect(resolveMessage(catalog.first())).toBe('First');
		expect(resolveMessage(catalog.second())).toBe('Second');
		expect(resolveMessage(catalog.third())).toBe('Third');
	});
});
