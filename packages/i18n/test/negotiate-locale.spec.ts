import { describe, expect, test } from 'bun:test';

import { defineLocaleNegotiator } from '#/negotiate-locale';

const negotiate = defineLocaleNegotiator({
	supported: ['en', 'fr', 'it'],
	fallback: 'en'
});

describe.concurrent('defineLocaleNegotiator', (): void => {
	test('should return the fallback when no header is provided', (): void => {
		expect(negotiate()).toBe('en');
	});

	test('should return the fallback for an empty header', (): void => {
		expect(negotiate('')).toBe('en');
	});

	test('should return the fallback when no range is supported', (): void => {
		expect(negotiate('ja,ko')).toBe('en');
	});

	test('should return the fallback for a wildcard range', (): void => {
		expect(negotiate('*')).toBe('en');
	});

	test('should match an exact tag', (): void => {
		expect(negotiate('fr')).toBe('fr');
	});

	test('should fall back to the language subtag of a region-qualified range', (): void => {
		expect(negotiate('fr-CA')).toBe('fr');
	});

	test('should resolve a real browser header', (): void => {
		expect(negotiate('fr-CA,fr;q=0.9,en;q=0.8')).toBe('fr');
	});

	test('should honour quality values over header order', (): void => {
		expect(negotiate('it;q=0.5,fr;q=0.9')).toBe('fr');
	});

	test('should keep header order when qualities are equal', (): void => {
		expect(negotiate('it,fr')).toBe('it');
	});

	test('should skip a supported range explicitly refused with q=0', (): void => {
		expect(negotiate('fr;q=0,it;q=0.5')).toBe('it');
	});

	test('should skip unsupported ranges and take the next preferred one', (): void => {
		expect(negotiate('de,fr')).toBe('fr');
	});

	test('should be case-insensitive', (): void => {
		expect(negotiate('FR-CA')).toBe('fr');
	});

	test('should tolerate surrounding whitespace', (): void => {
		expect(negotiate(' it , fr ')).toBe('it');
	});

	test('should tolerate whitespace around a quality value', (): void => {
		expect(negotiate('it; q=0.2, fr; q=0.7')).toBe('fr');
	});

	test('should treat an unreadable quality value as the default weight', (): void => {
		expect(negotiate('fr;q=abc')).toBe('fr');
	});

	test('should reject a range weighted q=0.0', (): void => {
		expect(negotiate('fr;q=0.0,it')).toBe('it');
	});

	test('should ignore parameters other than the quality value', (): void => {
		expect(negotiate('fr;foo=bar')).toBe('fr');
	});

	test('should prefer an exact region-qualified locale over its language subtag', (): void => {
		const regional = defineLocaleNegotiator({
			supported: ['pt', 'pt-br'],
			fallback: 'pt'
		});

		expect(regional('pt-BR')).toBe('pt-br');
		expect(regional('pt-PT')).toBe('pt');
	});

	test('should narrow the return type to the supported locales', (): void => {
		const locale: 'en' | 'fr' | 'it' = negotiate('fr');

		expect(locale).toBe('fr');
	});
});
