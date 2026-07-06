import { describe, expect, test } from 'bun:test';

import { LocalizedHttpException } from '#/exception/localized-http-exception';
import type { LocalizedMessage } from '#/message/type/localized-message';
import { resolveMessage } from '#/resolve-message';

const makeMessage = (overrides: Partial<LocalizedMessage> = {}): LocalizedMessage => ({
	translations: { en: 'Hello', fr: 'Bonjour' },
	defaultLocale: 'en',
	...overrides
});

describe.concurrent('resolveMessage', (): void => {
	test('should return the default locale translation when no locale is specified', (): void => {
		const msg = makeMessage();

		expect(resolveMessage(msg)).toBe('Hello');
	});

	test('should return the requested locale translation', (): void => {
		const msg = makeMessage();

		expect(resolveMessage(msg, 'fr')).toBe('Bonjour');
	});

	test('should fall back to the default locale when the requested locale does not exist', (): void => {
		const msg = makeMessage();

		expect(resolveMessage(msg, 'ja')).toBe('Hello');
	});

	test('should return an empty string when even the default locale is missing', (): void => {
		const msg = makeMessage({ translations: {}, defaultLocale: 'en' });

		expect(resolveMessage(msg, 'ja')).toBe('');
	});

	test('should interpolate a single parameter', (): void => {
		const msg = makeMessage({
			translations: { en: 'Hello, {{name}}!' },
			params: { name: 'Alice' }
		});

		expect(resolveMessage(msg)).toBe('Hello, Alice!');
	});

	test('should interpolate multiple parameters', (): void => {
		const msg = makeMessage({
			translations: { en: 'TTL must be between {{min}} and {{max}}' },
			params: { min: '60', max: '86400' }
		});

		expect(resolveMessage(msg)).toBe('TTL must be between 60 and 86400');
	});

	test('should keep placeholder when param is missing from the record', (): void => {
		const msg = makeMessage({
			translations: { en: 'Hello, {{name}}!' },
			params: {}
		});

		expect(resolveMessage(msg)).toBe('Hello, {{name}}!');
	});

	test('should interpolate params in the requested locale', (): void => {
		const msg = makeMessage({
			translations: {
				en: 'Zone "{{zone}}" created',
				fr: 'Zone "{{zone}}" créée'
			},
			params: { zone: 'example.com' }
		});

		expect(resolveMessage(msg, 'fr')).toBe('Zone "example.com" créée');
	});

	test('should not interpolate when params is undefined', (): void => {
		const msg = makeMessage({
			translations: { en: 'No params {{here}}' },
			params: undefined
		});

		expect(resolveMessage(msg)).toBe('No params {{here}}');
	});

	test('should work with a LocalizedHttpException target', (): void => {
		const exception = new LocalizedHttpException('test.code', {
			status: 'BAD_REQUEST',
			translations: { en: 'Bad input: {{field}}', fr: 'Entrée invalide : {{field}}' },
			params: { field: 'email' },
			defaultLocale: 'en'
		});

		expect(resolveMessage(exception)).toBe('Bad input: email');
		expect(resolveMessage(exception, 'fr')).toBe('Entrée invalide : email');
	});

	test('should handle templates with adjacent placeholders', (): void => {
		const msg = makeMessage({
			translations: { en: '{{a}}{{b}}' },
			params: { a: 'X', b: 'Y' }
		});

		expect(resolveMessage(msg)).toBe('XY');
	});

	test('should ignore malformed placeholders', (): void => {
		const msg = makeMessage({
			translations: { en: 'Hello {name} and {{ spaced }}' },
			params: { name: 'Alice', ' spaced ': 'nope' }
		});

		expect(resolveMessage(msg)).toBe('Hello {name} and {{ spaced }}');
	});
});
