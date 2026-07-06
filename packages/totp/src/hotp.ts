import { Exception } from '@dws-std/error';
import { timingSafeEqual } from 'crypto';

import type { OTPAlgorithm } from './type/otp-algorithm';
import { createCounterBuffer } from './util/create-counter-buffer';
import { decodeBase32 } from './util/decode-base32';

export const HOTP_ERROR_KEYS = {
	INVALID_SECRET: 'totp.hotp.invalid-secret',
	INVALID_DIGITS: 'totp.hotp.invalid-digits',
	HMAC_FAILED: 'totp.hotp.hmac-failed'
} as const;

/** Options for HOTP code generation. */
export interface GenerateHOTPOptions {
	/** The shared secret, either as a base32-encoded string or raw bytes. */
	readonly secret: string | Uint8Array;

	/** The counter value. */
	readonly counter: number | bigint;

	/** Number of digits in the generated code (1-10, default: 6). */
	readonly digits?: number | undefined;

	/** HMAC algorithm to use (default: `'SHA-1'`). */
	readonly algorithm?: OTPAlgorithm | undefined;
}

/** Options for HOTP code verification. */
export interface VerifyHOTPOptions extends GenerateHOTPOptions {
	/** The OTP code to verify. */
	readonly otp: string;

	/** Number of counter values to check ahead of the given counter (default: 0). */
	readonly window?: number | undefined;
}

const importKey = (secret: Uint8Array<ArrayBuffer>, algorithm: OTPAlgorithm): Promise<CryptoKey> =>
	crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: algorithm }, false, ['sign']);

const byteAt = (array: Uint8Array<ArrayBuffer>, index: number): number => {
	const value = array[index];
	if (value === undefined) throw new RangeError(`Index ${index} out of bounds`);
	return value;
};

const dynamicTruncate = (hmac: Uint8Array<ArrayBuffer>, digits: number): string => {
	const offset = byteAt(hmac, hmac.length - 1) & 0x0f;
	// rfc4226 5.4
	const binary =
		((byteAt(hmac, offset) & 0x7f) << 24) |
		((byteAt(hmac, offset + 1) & 0xff) << 16) |
		((byteAt(hmac, offset + 2) & 0xff) << 8) |
		(byteAt(hmac, offset + 3) & 0xff);
	return (binary % 10 ** digits).toString().padStart(digits, '0');
};

/**
 * Generates an HMAC-Based One-Time Password (HOTP) as defined in RFC 4226.
 *
 * @param options - HOTP generation parameters.
 *
 * @throws ({@link Exception}) - If the secret is empty, digits is out of range, or HMAC computation fails.
 *
 * @returns The generated OTP code as a zero-padded string.
 */
export const generateHOTP = async (options: GenerateHOTPOptions): Promise<string> => {
	const { secret, counter, digits = 6, algorithm = 'SHA-1' } = options;

	const secretBytes = typeof secret === 'string' ? decodeBase32(secret) : new Uint8Array(secret);
	if (secretBytes.length === 0)
		throw new Exception('Secret must not be empty', {
			key: HOTP_ERROR_KEYS.INVALID_SECRET
		});

	if (digits < 1 || digits > 10)
		throw new Exception('Digits must be between 1 and 10', {
			key: HOTP_ERROR_KEYS.INVALID_DIGITS,
			cause: { digits }
		});

	const counterBuffer = createCounterBuffer(counter);

	try {
		const key = await importKey(secretBytes, algorithm);
		const hmacBuffer = await crypto.subtle.sign('HMAC', key, counterBuffer);
		return dynamicTruncate(new Uint8Array(hmacBuffer), digits);
	} catch (error) {
		if (error instanceof Exception) throw error;
		throw new Exception('HMAC computation failed', {
			key: HOTP_ERROR_KEYS.HMAC_FAILED,
			cause: error
		});
	}
};

/**
 * Verifies an HMAC-Based One-Time Password (HOTP) against a counter value.
 *
 * Checks the given counter and optionally a look-ahead window of subsequent counter values.
 *
 * @param options - HOTP verification parameters.
 *
 * @throws ({@link Exception}) - If any generation parameter is invalid.
 *
 * @returns `true` if the OTP matches any counter in the window, `false` otherwise.
 */
export const verifyHOTP = async (options: VerifyHOTPOptions): Promise<boolean> => {
	const { otp, window = 0, ...generateOptions } = options;
	const counter =
		typeof generateOptions.counter === 'bigint'
			? generateOptions.counter
			: BigInt(Math.floor(generateOptions.counter));

	const candidates = await Promise.all(
		Array.from({ length: window + 1 }, (_, i) =>
			generateHOTP({ ...generateOptions, counter: counter + BigInt(i) })
		)
	);

	const otpBuffer = Buffer.from(otp);
	let match = false;
	for (const candidate of candidates) {
		const candidateBuffer = Buffer.from(candidate);
		if (
			candidateBuffer.length === otpBuffer.length &&
			timingSafeEqual(candidateBuffer, otpBuffer)
		)
			match = true;
	}
	return match;
};
