/** RFC 4648 base32 alphabet — what authenticator apps expect in OTP secrets. */
export const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Set view of {@link BASE32_ALPHABET} for fast membership checks. */
export const BASE32_CHARS = new Set(BASE32_ALPHABET);
