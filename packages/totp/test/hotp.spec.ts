import { Exception } from '@clov-std/error';
import { describe, expect, spyOn, test } from 'bun:test';

import { generateHOTP, HOTP_ERROR_KEYS, verifyHOTP } from '#/hotp';
import { DECODE_BASE32_ERROR_KEYS } from '#/util/decode-base32';

// RFC 4226 Appendix D — test values for HOTP with SHA-1
// Secret = "12345678901234567890" (ASCII), counter 0-9
const RFC4226_SECRET = new TextEncoder().encode('12345678901234567890');
const RFC4226_EXPECTED: readonly string[] = [
	'755224',
	'287082',
	'359152',
	'969429',
	'338314',
	'254676',
	'287922',
	'162583',
	'399871',
	'520489'
];

describe.concurrent('generateHOTP', () => {
	describe('RFC 4226 test vectors', () => {
		test.each(
			RFC4226_EXPECTED.map((expected, counter) => ({
				name: `counter=${counter}`,
				counter,
				expected
			}))
		)('should produce $expected for $name', async ({ counter, expected }) => {
			const otp = await generateHOTP({ secret: RFC4226_SECRET, counter });
			expect(otp).toBe(expected);
		});
	});

	test('should accept a base32-encoded secret string', async () => {
		// "12345678901234567890" in base32 = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
		const otp = await generateHOTP({
			secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
			counter: 0
		});
		expect(otp).toBe('755224');
	});

	test('should accept bigint counter', async () => {
		const otp = await generateHOTP({ secret: RFC4226_SECRET, counter: 1n });
		expect(otp).toBe('287082');
	});

	test('should generate 8-digit codes when digits=8', async () => {
		const otp = await generateHOTP({ secret: RFC4226_SECRET, counter: 0, digits: 8 });
		expect(otp).toHaveLength(8);
	});

	test('should zero-pad short codes', async () => {
		// All RFC 4226 codes are already 6 digits, but verify the format
		const otp = await generateHOTP({ secret: RFC4226_SECRET, counter: 0 });
		expect(otp).toMatch(/^\d{6}$/);
	});

	test.each([
		{ name: 'SHA-256', algorithm: 'SHA-256' as const },
		{ name: 'SHA-512', algorithm: 'SHA-512' as const }
	])('should support $name algorithm', async ({ algorithm }) => {
		const otp = await generateHOTP({ secret: RFC4226_SECRET, counter: 0, algorithm });
		expect(otp).toMatch(/^\d{6}$/);
	});

	test('should produce different codes for different counters', async () => {
		const otp0 = await generateHOTP({ secret: RFC4226_SECRET, counter: 0 });
		const otp1 = await generateHOTP({ secret: RFC4226_SECRET, counter: 1 });
		expect(otp0).not.toBe(otp1);
	});

	test('should produce deterministic results for same inputs', async () => {
		const otp1 = await generateHOTP({ secret: RFC4226_SECRET, counter: 5 });
		const otp2 = await generateHOTP({ secret: RFC4226_SECRET, counter: 5 });
		expect(otp1).toBe(otp2);
	});

	describe('error handling', () => {
		test('should throw INVALID_SECRET for empty Uint8Array secret', async () => {
			try {
				await generateHOTP({ secret: new Uint8Array(0), counter: 0 });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(HOTP_ERROR_KEYS.INVALID_SECRET);
			}
		});

		test('should throw INVALID_BASE32 for invalid base32 string', async () => {
			try {
				await generateHOTP({ secret: '!!!INVALID!!!', counter: 0 });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(DECODE_BASE32_ERROR_KEYS.INVALID_CHAR);
			}
		});

		test.each([0, -1, 11, 100])('should throw INVALID_DIGITS for digits=%i', async (digits) => {
			try {
				await generateHOTP({ secret: RFC4226_SECRET, counter: 0, digits });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(HOTP_ERROR_KEYS.INVALID_DIGITS);
				expect((error as Exception).cause).toEqual({ digits });
			}
		});

		test('should throw HMAC_FAILED when crypto.subtle.sign fails', async () => {
			const spy = spyOn(crypto.subtle, 'sign').mockRejectedValue(
				new Error('Mocked sign error')
			);

			try {
				await generateHOTP({ secret: RFC4226_SECRET, counter: 0 });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).message).toBe('HMAC computation failed');
				expect((error as Exception).key).toBe(HOTP_ERROR_KEYS.HMAC_FAILED);
				expect((error as Exception).cause).toBeInstanceOf(Error);
				expect(((error as Exception).cause as Error).message).toBe('Mocked sign error');
			} finally {
				spy.mockRestore();
			}
		});
	});
});

describe('verifyHOTP', () => {
	test('should return true for a valid OTP at exact counter', async () => {
		const result = await verifyHOTP({
			secret: RFC4226_SECRET,
			counter: 0,
			otp: '755224'
		});
		expect(result).toBe(true);
	});

	test('should return false for an invalid OTP', async () => {
		const result = await verifyHOTP({
			secret: RFC4226_SECRET,
			counter: 0,
			otp: '000000'
		});
		expect(result).toBe(false);
	});

	test('should return false when OTP matches a different counter without window', async () => {
		// '287082' is the code for counter=1, not counter=0
		const result = await verifyHOTP({
			secret: RFC4226_SECRET,
			counter: 0,
			otp: '287082',
			window: 0
		});
		expect(result).toBe(false);
	});

	test('should return true when OTP is within the look-ahead window', async () => {
		// '287082' is counter=1, check from counter=0 with window=1
		const result = await verifyHOTP({
			secret: RFC4226_SECRET,
			counter: 0,
			otp: '287082',
			window: 1
		});
		expect(result).toBe(true);
	});

	test('should return true for OTP at the edge of the window', async () => {
		// '969429' is counter=3, check from counter=0 with window=3
		const result = await verifyHOTP({
			secret: RFC4226_SECRET,
			counter: 0,
			otp: '969429',
			window: 3
		});
		expect(result).toBe(true);
	});

	test('should return false when OTP is just beyond the window', async () => {
		// '969429' is counter=3, check from counter=0 with window=2
		const result = await verifyHOTP({
			secret: RFC4226_SECRET,
			counter: 0,
			otp: '969429',
			window: 2
		});
		expect(result).toBe(false);
	});

	test('should work with bigint counter', async () => {
		const result = await verifyHOTP({
			secret: RFC4226_SECRET,
			counter: 5n,
			otp: '254676'
		});
		expect(result).toBe(true);
	});

	test('should work with base32 secret', async () => {
		const result = await verifyHOTP({
			secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
			counter: 0,
			otp: '755224'
		});
		expect(result).toBe(true);
	});
});
