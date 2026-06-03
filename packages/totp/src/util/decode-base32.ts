import { Exception } from '@dws-std/error';

import { BASE32_ALPHABET, BASE32_CHARS } from '#/util/base32';

export const DECODE_BASE32_ERROR_KEYS = {
	INVALID_CHAR: 'totp.decode-base32.invalid-char'
} as const;

/**
 * Decodes a base32-encoded string into a Uint8Array (RFC 4648).
 *
 * @param input - The base32-encoded string to decode.
 *
 * @throws ({@link Exception}) - If the input contains invalid base32 characters.
 *
 * @returns The decoded bytes.
 */
export const decodeBase32 = (input: string): Uint8Array<ArrayBuffer> => {
	const sanitized = input.toUpperCase().replace(/[\s=]/g, '');

	for (const char of sanitized)
		if (!BASE32_CHARS.has(char))
			throw new Exception(`Invalid base32 character: '${char}'`, {
				key: DECODE_BASE32_ERROR_KEYS.INVALID_CHAR,
				cause: { input, invalidCharacter: char }
			});

	const output = new Uint8Array(Math.floor((sanitized.length * 5) / 8));
	let bits = 0;
	let value = 0;
	let index = 0;

	for (const char of sanitized) {
		value = (value << 5) | BASE32_ALPHABET.indexOf(char);
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			output[index++] = (value >>> bits) & 0xff;
		}
	}

	return output;
};
