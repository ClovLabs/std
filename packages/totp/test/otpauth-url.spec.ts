import { describe, expect, test } from 'bun:test';

import { buildOtpauthUrl } from '#/otpauth-url';

describe.concurrent('buildOtpauthUrl', () => {
	test('should build a totp uri with period and defaults', () => {
		const url = buildOtpauthUrl({
			type: 'totp',
			secret: 'JBSWY3DPEHPK3PXP',
			accountName: 'alice@example.com',
			issuer: 'DWS'
		});
		const parsed = new URL(url);

		expect(parsed.protocol).toBe('otpauth:');
		expect(parsed.host).toBe('totp');
		expect(decodeURIComponent(parsed.pathname.slice(1))).toBe('DWS:alice@example.com');
		expect(parsed.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
		expect(parsed.searchParams.get('issuer')).toBe('DWS');
		expect(parsed.searchParams.get('algorithm')).toBe('SHA1');
		expect(parsed.searchParams.get('digits')).toBe('6');
		expect(parsed.searchParams.get('period')).toBe('30');
		expect(parsed.searchParams.get('counter')).toBeNull();
	});

	test('should build an hotp uri with a counter instead of a period', () => {
		const url = buildOtpauthUrl({
			type: 'hotp',
			secret: 'JBSWY3DPEHPK3PXP',
			accountName: 'bob@example.com',
			issuer: 'DWS',
			counter: 42
		});
		const parsed = new URL(url);

		expect(parsed.host).toBe('hotp');
		expect(parsed.searchParams.get('counter')).toBe('42');
		expect(parsed.searchParams.get('period')).toBeNull();
	});

	test('should normalise the algorithm to its dash-less spelling', () => {
		const url = buildOtpauthUrl({
			type: 'totp',
			secret: 'JBSWY3DPEHPK3PXP',
			accountName: 'alice@example.com',
			issuer: 'DWS',
			algorithm: 'SHA-256',
			digits: 8,
			period: 60
		});
		const parsed = new URL(url);

		expect(parsed.searchParams.get('algorithm')).toBe('SHA256');
		expect(parsed.searchParams.get('digits')).toBe('8');
		expect(parsed.searchParams.get('period')).toBe('60');
	});
});
