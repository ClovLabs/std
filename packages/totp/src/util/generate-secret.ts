import { randomBytes } from 'crypto';

import { BASE32_ALPHABET } from './base32';

/**
 * Generates a random base32-encoded secret suitable for both HOTP and TOTP.
 *
 * Each character carries 5 bits of entropy. `byte % 32` is unbiased because
 * 256 is an exact multiple of 32, so no character of the alphabet is favoured.
 *
 * @param length - Number of characters in the generated secret.
 *
 * @returns The base32-encoded secret.
 */
export const generateOTPSecret = (length: number): string => {
	let secret = '';
	for (const byte of randomBytes(length)) secret += BASE32_ALPHABET.charAt(byte % 32);
	return secret;
};
