import type { OTPAlgorithm } from '#/type/otp-algorithm';

/** Parameters shared by every otpauth provisioning URI. */
interface BaseOtpauthUrlParams {
	/** The base32-encoded shared secret. */
	readonly secret: string;

	/** The account the credential belongs to (e.g. an email address). */
	readonly accountName: string;

	/** The issuer / service name displayed by the authenticator app. */
	readonly issuer: string;

	/** Number of digits in the generated code (default: 6). */
	readonly digits?: number | undefined;

	/** HMAC algorithm to advertise (default: `'SHA-1'`). */
	readonly algorithm?: OTPAlgorithm | undefined;
}

/** Parameters for a time-based (TOTP) provisioning URI. */
export interface TOTPAuthUrlParams extends BaseOtpauthUrlParams {
	readonly type: 'totp';

	/** Time step duration in seconds (default: 30). */
	readonly period?: number | undefined;
}

/** Parameters for a counter-based (HOTP) provisioning URI. */
export interface HOTPAuthUrlParams extends BaseOtpauthUrlParams {
	readonly type: 'hotp';

	/** The initial counter value. */
	readonly counter: number;
}

/** Parameters for {@link buildOtpauthUrl}. */
export type OtpauthUrlParams = TOTPAuthUrlParams | HOTPAuthUrlParams;

/**
 * Builds an `otpauth://...` provisioning URI (Key Uri Format) for QR-code enrolment.
 *
 * Supports both `totp` (with a `period`) and `hotp` (with a `counter`) credentials.
 * The {@link OTPAlgorithm} value is normalised to the dash-less spelling the URI
 * format expects (`SHA-1` → `SHA1`).
 *
 * @param params - The provisioning parameters.
 *
 * @returns The `otpauth://` URI.
 */
export const buildOtpauthUrl = (params: OtpauthUrlParams): string => {
	const { type, secret, accountName, issuer, digits = 6, algorithm = 'SHA-1' } = params;

	const label = encodeURIComponent(`${issuer}:${accountName}`);
	const query = new URLSearchParams({
		secret,
		issuer,
		algorithm: algorithm.replace('-', ''),
		digits: digits.toString()
	});

	if (type === 'totp') query.set('period', (params.period ?? 30).toString());
	else query.set('counter', params.counter.toString());

	return `otpauth://${type}/${label}?${query.toString()}`;
};
