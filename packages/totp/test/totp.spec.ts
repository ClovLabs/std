import { Exception } from '@clov-std/error';
import { describe, expect, test } from 'bun:test';

import { generateHOTP, HOTP_ERROR_KEYS } from '#/hotp';
import { generateTOTP, TOTP_ERROR_KEYS, verifyTOTP } from '#/totp';

// RFC 6238 Appendix B — test values
// Secret = "12345678901234567890" (ASCII) for SHA-1
// Secret = "12345678901234567890123456789012" (ASCII) for SHA-256
// Secret = "1234567890123456789012345678901234567890123456789012345678901234" (ASCII) for SHA-512
const RFC6238_SHA1_SECRET = new TextEncoder().encode('12345678901234567890');
const RFC6238_SHA256_SECRET = new TextEncoder().encode('12345678901234567890123456789012');
const RFC6238_SHA512_SECRET = new TextEncoder().encode(
	'1234567890123456789012345678901234567890123456789012345678901234'
);

const RFC6238_VECTORS: readonly {
	readonly time: number;
	readonly algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512';
	readonly secret: Uint8Array;
	readonly expected: string;
}[] = [
	{ time: 59, algorithm: 'SHA-1', secret: RFC6238_SHA1_SECRET, expected: '94287082' },
	{ time: 59, algorithm: 'SHA-256', secret: RFC6238_SHA256_SECRET, expected: '46119246' },
	{ time: 59, algorithm: 'SHA-512', secret: RFC6238_SHA512_SECRET, expected: '90693936' },
	{ time: 1111111109, algorithm: 'SHA-1', secret: RFC6238_SHA1_SECRET, expected: '07081804' },
	{ time: 1111111109, algorithm: 'SHA-256', secret: RFC6238_SHA256_SECRET, expected: '68084774' },
	{ time: 1111111109, algorithm: 'SHA-512', secret: RFC6238_SHA512_SECRET, expected: '25091201' },
	{ time: 1111111111, algorithm: 'SHA-1', secret: RFC6238_SHA1_SECRET, expected: '14050471' },
	{ time: 1111111111, algorithm: 'SHA-256', secret: RFC6238_SHA256_SECRET, expected: '67062674' },
	{ time: 1111111111, algorithm: 'SHA-512', secret: RFC6238_SHA512_SECRET, expected: '99943326' },
	{ time: 1234567890, algorithm: 'SHA-1', secret: RFC6238_SHA1_SECRET, expected: '89005924' },
	{ time: 1234567890, algorithm: 'SHA-256', secret: RFC6238_SHA256_SECRET, expected: '91819424' },
	{ time: 1234567890, algorithm: 'SHA-512', secret: RFC6238_SHA512_SECRET, expected: '93441116' },
	{ time: 2000000000, algorithm: 'SHA-1', secret: RFC6238_SHA1_SECRET, expected: '69279037' },
	{ time: 2000000000, algorithm: 'SHA-256', secret: RFC6238_SHA256_SECRET, expected: '90698825' },
	{ time: 2000000000, algorithm: 'SHA-512', secret: RFC6238_SHA512_SECRET, expected: '38618901' },
	{ time: 20000000000, algorithm: 'SHA-1', secret: RFC6238_SHA1_SECRET, expected: '65353130' },
	{
		time: 20000000000,
		algorithm: 'SHA-256',
		secret: RFC6238_SHA256_SECRET,
		expected: '77737706'
	},
	{ time: 20000000000, algorithm: 'SHA-512', secret: RFC6238_SHA512_SECRET, expected: '47863826' }
];

describe.concurrent('generateTOTP', () => {
	describe.concurrent('RFC 6238 test vectors', () => {
		test.each(
			RFC6238_VECTORS.map((v) => ({
				name: `time=${v.time}, alg=${v.algorithm}`,
				...v
			}))
		)('should produce $expected for $name', async ({ time, algorithm, secret, expected }) => {
			const otp = await generateTOTP({
				secret,
				time,
				algorithm,
				digits: 8,
				period: 30
			});
			expect(otp).toBe(expected);
		});
	});

	test('should use current time by default', async () => {
		const expectedCounter = Math.floor(Date.now() / 1000 / 30);
		const otp = await generateTOTP({ secret: RFC6238_SHA1_SECRET });
		const hotpOtp = await generateHOTP({
			secret: RFC6238_SHA1_SECRET,
			counter: expectedCounter
		});
		expect(otp).toBe(hotpOtp);
	});

	test('should default to 6-digit codes', async () => {
		const otp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 59 });
		expect(otp).toHaveLength(6);
	});

	test('should support custom period', async () => {
		const otp60 = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 120, period: 60 });
		// counter = floor(120/60) = 2
		const hotpOtp = await generateHOTP({ secret: RFC6238_SHA1_SECRET, counter: 2 });
		expect(otp60).toBe(hotpOtp);
	});

	test('should produce deterministic results for same time and secret', async () => {
		const otp1 = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 1234567890 });
		const otp2 = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 1234567890 });
		expect(otp1).toBe(otp2);
	});

	test('should produce same code within the same time step', async () => {
		const otp1 = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 30, period: 30 });
		const otp2 = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 59, period: 30 });
		expect(otp1).toBe(otp2);
	});

	test('should produce different codes across time steps', async () => {
		const otp1 = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 29, period: 30 });
		const otp2 = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 30, period: 30 });
		expect(otp1).not.toBe(otp2);
	});

	describe.concurrent('error handling', () => {
		test.each([0, -1, -30])('should throw INVALID_PERIOD for period=%i', async (period) => {
			try {
				await generateTOTP({ secret: RFC6238_SHA1_SECRET, period });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(TOTP_ERROR_KEYS.INVALID_PERIOD);
				expect((error as Exception).cause).toEqual({ period });
			}
		});

		test('should throw INVALID_SECRET for empty secret', async () => {
			try {
				await generateTOTP({ secret: new Uint8Array(0) });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(HOTP_ERROR_KEYS.INVALID_SECRET);
			}
		});
	});
});

describe.concurrent('verifyTOTP', () => {
	test('should return true for a valid OTP at exact time', async () => {
		const time = 1234567890;
		const otp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time });
		const result = await verifyTOTP({ secret: RFC6238_SHA1_SECRET, time, otp });
		expect(result).toBe(true);
	});

	test('should return false for an invalid OTP', async () => {
		const result = await verifyTOTP({
			secret: RFC6238_SHA1_SECRET,
			time: 1234567890,
			otp: '000000'
		});
		expect(result).toBe(false);
	});

	test('should accept OTP from the previous time step with default window=1', async () => {
		const time = 60; // counter = 2
		const previousOtp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 30 }); // counter = 1
		const result = await verifyTOTP({ secret: RFC6238_SHA1_SECRET, time, otp: previousOtp });
		expect(result).toBe(true);
	});

	test('should accept OTP from the next time step with default window=1', async () => {
		const time = 30; // counter = 1
		const nextOtp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 60 }); // counter = 2
		const result = await verifyTOTP({ secret: RFC6238_SHA1_SECRET, time, otp: nextOtp });
		expect(result).toBe(true);
	});

	test('should reject OTP beyond the window', async () => {
		const time = 90; // counter = 3
		const farOtp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 0 }); // counter = 0
		const result = await verifyTOTP({
			secret: RFC6238_SHA1_SECRET,
			time,
			otp: farOtp,
			window: 1
		});
		expect(result).toBe(false);
	});

	test('should accept OTP within a larger window', async () => {
		const time = 90; // counter = 3
		const farOtp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 0 }); // counter = 0
		const result = await verifyTOTP({
			secret: RFC6238_SHA1_SECRET,
			time,
			otp: farOtp,
			window: 3
		});
		expect(result).toBe(true);
	});

	test('should reject all codes when window=0 and OTP is from adjacent step', async () => {
		const time = 60; // counter = 2
		const previousOtp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time: 30 }); // counter = 1
		const result = await verifyTOTP({
			secret: RFC6238_SHA1_SECRET,
			time,
			otp: previousOtp,
			window: 0
		});
		expect(result).toBe(false);
	});

	test('should work with custom period', async () => {
		const time = 120;
		const period = 60;
		const otp = await generateTOTP({ secret: RFC6238_SHA1_SECRET, time, period });
		const result = await verifyTOTP({ secret: RFC6238_SHA1_SECRET, time, otp, period });
		expect(result).toBe(true);
	});

	test('should work with different algorithms', async () => {
		const time = 59;
		const otp = await generateTOTP({
			secret: RFC6238_SHA256_SECRET,
			time,
			algorithm: 'SHA-256',
			digits: 8
		});
		const result = await verifyTOTP({
			secret: RFC6238_SHA256_SECRET,
			time,
			otp,
			algorithm: 'SHA-256',
			digits: 8
		});
		expect(result).toBe(true);
	});

	describe.concurrent('error handling', () => {
		test('should throw INVALID_PERIOD for zero period', async () => {
			try {
				await verifyTOTP({
					secret: RFC6238_SHA1_SECRET,
					otp: '123456',
					period: 0
				});
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(TOTP_ERROR_KEYS.INVALID_PERIOD);
			}
		});
	});
});
