import { Exception } from '@clov-std/error';
import { SignJWT, errors, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose';

export const JWT_ERROR_KEYS = {
	JWT_SECRET_TOO_WEAK: 'jwt.secret-too-weak',
	JWT_EXPIRATION_PASSED: 'jwt.expiration-passed',
	JWT_SIGN_ERROR: 'jwt.sign-error',
	JWT_EXPIRED: 'jwt.token-expired',
	JWT_UNAUTHORIZED: 'jwt.unauthorized'
} as const;

// Avoid re-instantiation on each call
const textEncoder = new TextEncoder();

export interface VerifyOptions {
	issuer?: string;
	audience?: string | string[];
}

/**
 * Signs a JWT with the given payload and expiration
 *
 * @param secret - The secret key used for HS256 signing (minimum 32 characters)
 * @param payload - The JWT payload claims
 * @param expirationSeconds - Token expiration as a seconds offset from now (default: 15 minutes)
 *
 * @throws ({@link Exception}) - If secret is too short, expiration is in the past, or signing fails
 *
 * @returns A Promise resolving to the signed JWT string
 */
export const signJWT = (
	secret: string,
	payload: JWTPayload,
	expirationSeconds: number = 60 * 15 // 15 minutes
): Promise<string> => {
	if (secret.length < 32)
		throw new Exception('Secret key must be at least 32 characters long', {
			key: JWT_ERROR_KEYS.JWT_SECRET_TOO_WEAK,
			cause: { providedLength: secret.length }
		});

	const nowSeconds = Math.floor(Date.now() / 1000);
	const exp = nowSeconds + expirationSeconds;

	if (exp <= nowSeconds)
		throw new Exception('Expiration time must be in the future', {
			key: JWT_ERROR_KEYS.JWT_EXPIRATION_PASSED,
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

	try {
		return new SignJWT(finalPayload)
			.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
			.sign(textEncoder.encode(secret));
	} catch (error) {
		throw new Exception('Failed to sign JWT', {
			key: JWT_ERROR_KEYS.JWT_SIGN_ERROR,
			cause: error
		});
	}
};

/**
 * Verifies a JWT token and throws Exception on failure
 *
 * @param token - The JWT token string to verify
 * @param secret - The secret key used for HS256 verification
 * @param options - Optional verification options for issuer/audience validation
 *
 * @throws ({@link Exception}) - 401 if token is expired, invalid signature, malformed, or claim validation fails
 *
 * @returns The verification result with payload and protected header
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
				key: JWT_ERROR_KEYS.JWT_EXPIRED
			});
		throw new Exception('Unauthorized', {
			key: JWT_ERROR_KEYS.JWT_UNAUTHORIZED
		});
	}
};
