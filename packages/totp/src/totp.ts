import { Exception } from '@clov-std/error';
import { timingSafeEqual } from 'crypto';

import { generateHOTP } from './hotp';
import type { OTPAlgorithm } from './type/otp-algorithm';

export const TOTP_ERROR_KEYS = {
	INVALID_PERIOD: 'totp.invalid-period'
} as const;

/** Options for TOTP code generation. */
export interface GenerateTOTPOptions {
	/** The shared secret, either as a base32-encoded string or raw bytes. */
	readonly secret: string | Uint8Array;

	/** Number of digits in the generated code (1-10, default: 6). */
	readonly digits?: number | undefined;

	/** HMAC algorithm to use (default: `'SHA-1'`). */
	readonly algorithm?: OTPAlgorithm | undefined;

	/** Time step duration in seconds (default: 30). */
	readonly period?: number | undefined;

	/** Unix timestamp in seconds to generate the code for (default: current time). */
	readonly time?: number | undefined;
}

/** Options for TOTP code verification. */
export interface VerifyTOTPOptions extends GenerateTOTPOptions {
	/** The OTP code to verify. */
	readonly otp: string;

	/** Number of time steps to check before and after the current step (default: 1). */
	readonly window?: number | undefined;
}

/**
 * Generates a Time-Based One-Time Password (TOTP) as defined in RFC 6238.
 *
 * @param options - TOTP generation parameters.
 *
 * @throws ({@link Exception}) - If the period is invalid or HOTP generation fails.
 *
 * @returns The generated OTP code as a zero-padded string.
 */
export const generateTOTP = (options: GenerateTOTPOptions): Promise<string> => {
	const { period = 30, time = Math.floor(Date.now() / 1000), ...hotpOptions } = options;

	if (period <= 0)
		throw new Exception('Period must be a positive number', {
			key: TOTP_ERROR_KEYS.INVALID_PERIOD,
			cause: { period }
		});

	const counter = Math.floor(time / period);
	return generateHOTP({ ...hotpOptions, counter });
};

/**
 * Verifies a Time-Based One-Time Password (TOTP) against the current or specified time.
 *
 * Checks time steps within the given window to account for clock drift.
 *
 * @param options - TOTP verification parameters.
 *
 * @throws ({@link Exception}) - If any generation parameter is invalid.
 *
 * @returns `true` if the OTP matches any time step in the window, `false` otherwise.
 */
export const verifyTOTP = async (options: VerifyTOTPOptions): Promise<boolean> => {
	const {
		otp,
		window = 1,
		period = 30,
		time = Math.floor(Date.now() / 1000),
		...hotpOptions
	} = options;

	if (period <= 0)
		throw new Exception('Period must be a positive number', {
			key: TOTP_ERROR_KEYS.INVALID_PERIOD,
			cause: { period }
		});

	const counter = Math.floor(time / period);

	const candidates = await Promise.all(
		Array.from({ length: window * 2 + 1 }, (_, i) =>
			generateHOTP({ ...hotpOptions, counter: counter - window + i })
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
