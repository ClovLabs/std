import { Exception } from '@clov-std/error';
import { SignJWT, errors, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose';

export const JWT_ERROR_CODES = {
	SECRET_TOO_WEAK: 'jwt.secret.too-weak',
	EXPIRATION_IN_PAST: 'jwt.expiration.in-past',
	SIGNING_FAILED: 'jwt.signing.failed',
	TOKEN_EXPIRED: 'jwt.token.expired',
	TOKEN_INVALID: 'jwt.token.invalid'
} as const;

// Avoid re-instantiation on each call
const textEncoder = new TextEncoder();

export interface VerifyOptions {
	issuer?: string;
	audience?: string | string[];
}

/**
 * Signs an HS256 JWT.
 *
 * Defaults `iss` to `'Clov-Issuer'`, `aud` to `['Clov-Audience']`, `sub` to `''` and `nbf`, `iat`
 * and `exp` from the current time; any of them set in `payload` wins.
 *
 * @param secret - HS256 key, at least 32 characters
 * @param payload - Claims to sign
 * @param expirationSeconds - Lifetime from now, in seconds (default: 15 minutes)
 *
 * @throws ({@link Exception}) - `jwt.secret.too-weak` or `jwt.expiration.in-past`, thrown synchronously, if the secret is
 * shorter than 32 characters or `expirationSeconds` is not positive
 *
 * @returns A promise of the signed token; it rejects with an {@link Exception} (`jwt.signing.failed`, original error as
 * `cause`) if signing fails
 */
export const signJWT = (
	secret: string,
	payload: JWTPayload,
	expirationSeconds: number = 60 * 15
): Promise<string> => {
	if (secret.length < 32)
		throw new Exception('Secret key must be at least 32 characters long', {
			code: JWT_ERROR_CODES.SECRET_TOO_WEAK,
			cause: { providedLength: secret.length }
		});

	const nowSeconds = Math.floor(Date.now() / 1000);
	const exp = nowSeconds + expirationSeconds;

	if (exp <= nowSeconds)
		throw new Exception('Expiration time must be in the future', {
			code: JWT_ERROR_CODES.EXPIRATION_IN_PAST,
			cause: { providedExpirationSeconds: expirationSeconds }
		});

	const finalPayload: JWTPayload = {
		iss: 'Clov-Issuer',
		sub: '',
		aud: ['Clov-Audience'],
		nbf: nowSeconds,
		iat: nowSeconds,
		exp,
		...payload
	};

	const fail = (error: unknown): never => {
		throw new Exception('Failed to sign JWT', {
			code: JWT_ERROR_CODES.SIGNING_FAILED,
			cause: error
		});
	};

	try {
		return new SignJWT(finalPayload)
			.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
			.sign(textEncoder.encode(secret))
			.catch(fail);
	} catch (error) {
		return fail(error);
	}
};

/**
 * Verifies an HS256 JWT.
 *
 * @param token - Token to verify
 * @param secret - HS256 key it was signed with
 * @param options - Expected `iss` and `aud`, checked only when given
 *
 * @throws ({@link Exception}) - `jwt.token.expired` if the token has expired, `jwt.token.invalid` for any other
 * failure (bad signature, malformed token, failed claim check)
 *
 * @returns The verified payload and protected header
 */
export const verifyJWT = async (
	token: string,
	secret: string,
	options?: VerifyOptions
): Promise<JWTVerifyResult> => {
	try {
		return await jwtVerify(token, textEncoder.encode(secret), {
			algorithms: ['HS256'],
			...(options?.issuer && { issuer: options.issuer }),
			...(options?.audience && { audience: options.audience })
		});
	} catch (error) {
		if (error instanceof errors.JWTExpired)
			throw new Exception('JWT token has expired', {
				code: JWT_ERROR_CODES.TOKEN_EXPIRED
			});
		throw new Exception('Unauthorized', {
			code: JWT_ERROR_CODES.TOKEN_INVALID
		});
	}
};
