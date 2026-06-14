import { Exception } from '@dws-std/error';
import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { JWTPayload } from 'jose';

import { JWT_ERROR_KEYS, signJWT, verifyJWT } from '#/jwt';

describe.concurrent('JWT Core Functions', () => {
	const testSecret = 'my-very-secure-secret-key-that-is-long-enough-for-hs256-algorithm';
	const wrongSecret = 'wrong-secret-key-that-is-also-long-enough-for-hs256';
	const userUuid = Bun.randomUUIDv7();

	// Time constants
	const ONE_HOUR = 3600;
	const TWO_HOURS = 7200;
	const DEFAULT_EXPIRY_MINUTES = 15;
	const DEFAULT_EXPIRY_SECONDS = DEFAULT_EXPIRY_MINUTES * 60;

	let currentTime: number;

	beforeEach(() => {
		currentTime = Math.floor(Date.now() / 1000);
	});

	describe('signJWT', () => {
		test('should sign a JWT with default expiration (15 minutes)', async () => {
			const payload: JWTPayload = { sub: userUuid, role: 'admin' };
			const token = await signJWT(testSecret, payload);

			expect(token).toBeTypeOf('string');
			expect(token.split('.')).toHaveLength(3); // Header.Payload.Signature

			// Verify the token to check its contents
			const result = await verifyJWT(token, testSecret);
			expect(result.payload.sub).toBe(userUuid);
			expect(result.payload.role).toBe('admin');
			expect(result.payload.exp).toBeGreaterThan(currentTime);
			expect(result.payload.exp).toBeLessThanOrEqual(
				currentTime + DEFAULT_EXPIRY_SECONDS + 5
			); // Allow 5s tolerance
		});

		test.each([
			{
				name: 'numeric expiration (seconds offset)',
				getExpiration: (): number => ONE_HOUR,
				expectedExpiration: (timestampNow: number): number => timestampNow + ONE_HOUR,
				tolerance: 5
			},
			{
				name: 'numeric expiration (2 hours)',
				getExpiration: (): number => TWO_HOURS,
				expectedExpiration: (timestampNow: number): number => timestampNow + TWO_HOURS,
				tolerance: 5
			},
			{
				name: 'numeric expiration (30 minutes)',
				getExpiration: (): number => 30 * 60,
				expectedExpiration: (timestampNow: number): number => timestampNow + 30 * 60,
				tolerance: 5
			},
			{
				name: 'numeric expiration (1 day)',
				getExpiration: (): number => 24 * 60 * 60,
				expectedExpiration: (timestampNow: number): number => timestampNow + 24 * 60 * 60,
				tolerance: 5
			}
		])(
			'should sign JWT with $name',
			async ({ getExpiration, expectedExpiration, tolerance }) => {
				const expiration = getExpiration();
				const token = await signJWT(testSecret, {}, expiration);

				const result = await verifyJWT(token, testSecret);

				const expected = expectedExpiration(currentTime);
				expect(result.payload.exp).toBeGreaterThanOrEqual(expected - tolerance);
				expect(result.payload.exp).toBeLessThanOrEqual(expected + tolerance);
			}
		);

		test('should include all standard JWT claims', async () => {
			const payload: JWTPayload = { userId: 111, customField: 'test' };
			const token = await signJWT(testSecret, payload);

			const result = await verifyJWT(token, testSecret);

			const { payload: decodedPayload } = result;
			expect(decodedPayload.iss).toBe('DWS-Issuer');
			expect(decodedPayload.sub).toBe('');
			expect(decodedPayload.aud).toEqual(['DWS-Audience']);
			expect(decodedPayload.nbf).toBeTypeOf('number');
			expect(decodedPayload.iat).toBeTypeOf('number');
			expect(decodedPayload.exp).toBeTypeOf('number');
			expect(decodedPayload.userId).toBe(111);
			expect(decodedPayload.customField).toBe('test');
		});

		test('should override default claims with payload values', async () => {
			const payload: JWTPayload = {
				iss: 'Custom-Issuer',
				sub: 'user-123',
				aud: ['Custom-Audience'],
				userId: 222
			};
			const token = await signJWT(testSecret, payload);

			const result = await verifyJWT(token, testSecret);

			const { payload: decodedPayload } = result;
			expect(decodedPayload.iss).toBe('Custom-Issuer');
			expect(decodedPayload.sub).toBe('user-123');
			expect(decodedPayload.aud).toEqual(['Custom-Audience']);
			expect(decodedPayload.userId).toBe(222);
		});

		test('should generate unique JWT IDs for different tokens', async () => {
			const token1 = await signJWT(testSecret, {
				jti: Bun.randomUUIDv7()
			});
			const token2 = await signJWT(testSecret, {
				jti: Bun.randomUUIDv7()
			});

			const result1 = await verifyJWT(token1, testSecret);
			const result2 = await verifyJWT(token2, testSecret);

			expect(result1.payload.jti).not.toBe(result2.payload.jti);
		});

		test.each([
			{
				name: 'numeric expiration in past (negative offset)',
				getExpiration: (): number => -ONE_HOUR
			},
			{
				name: 'numeric offset equal to zero',
				getExpiration: (): number => 0
			}
		])(
			'should throw Exception with JWT_EXPIRATION_PASSED when expiration is $name',
			async ({ getExpiration }) => {
				const expiration = getExpiration();

				try {
					await signJWT(testSecret, {}, expiration);
					expect.unreachable();
				} catch (error) {
					expect(error).toBeInstanceOf(Exception);
					expect((error as Exception).message).toBe(
						'Expiration time must be in the future'
					);
					expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_EXPIRATION_PASSED);
					expect((error as Exception).cause).toEqual({
						providedExpirationSeconds: expiration
					});
				}
			}
		);

		test('should handle empty payload', async () => {
			const token = await signJWT(testSecret, {});

			const result = await verifyJWT(token, testSecret);
			expect(result.payload.iss).toBe('DWS-Issuer');
			expect(result.payload.sub).toBe('');
			expect(result.payload.aud).toEqual(['DWS-Audience']);
			expect(result.payload.nbf).toBeTypeOf('number');
			expect(result.payload.iat).toBeTypeOf('number');
			expect(result.payload.exp).toBeTypeOf('number');
		});

		test('should handle complex payload objects', async () => {
			const complexPayload: JWTPayload = {
				userId: 666,
				permissions: ['read', 'write', 'admin'],
				metadata: {
					source: 'api',
					version: '1.0.0',
					features: {
						premium: true,
						beta: false
					}
				},
				tags: null,
				isActive: true
			};

			const token = await signJWT(testSecret, complexPayload);
			const result = await verifyJWT(token, testSecret);

			expect(result.payload.userId).toBe(666);
			expect(result.payload.permissions).toEqual(['read', 'write', 'admin']);
			expect(result.payload.metadata).toEqual({
				source: 'api',
				version: '1.0.0',
				features: {
					premium: true,
					beta: false
				}
			});
			expect(result.payload.tags).toBeNull();
			expect(result.payload.isActive).toBe(true);
		});

		test('should throw Exception with JWT_SIGN_ERROR when signing fails', async () => {
			// Use spyOn to mock the sign method and make it throw an error
			const jose = await import('jose');
			const spy = spyOn(jose.SignJWT.prototype, 'sign').mockImplementation(() => {
				throw new Error('Mocked sign error');
			});

			try {
				await signJWT(testSecret, { userId: 123 });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).message).toBe('Failed to sign JWT');
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_SIGN_ERROR);
				expect((error as Exception).cause).toBeInstanceOf(Error);
				expect(((error as Exception).cause as Error).message).toBe('Mocked sign error');
			} finally {
				spy.mockRestore();
			}
		});
	});

	describe('verifyJWT', () => {
		test('should verify valid JWT and return payload', async () => {
			const payload: JWTPayload = { userId: 777, role: 'user' };
			const token = await signJWT(testSecret, payload);

			const result = await verifyJWT(token, testSecret);
			expect(result.payload.userId).toBe(777);
			expect(result.payload.role).toBe('user');
		});

		test.each([
			['invalid token format', 'invalid.token.format'],
			['empty token', ''],
			['malformed JWT', 'not.a.jwt'],
			['token with only dots', '...'],
			['token with special characters', '!@#$%^&*()']
		])('should throw Exception with JWT_UNAUTHORIZED for %s', async (_, invalidToken) => {
			try {
				await verifyJWT(invalidToken, testSecret);
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_UNAUTHORIZED);
			}
		});

		test('should throw Exception with JWT_UNAUTHORIZED for wrong secret', async () => {
			const token = await signJWT(testSecret, {});

			try {
				await verifyJWT(token, wrongSecret);
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_UNAUTHORIZED);
			}
		});

		test('should throw Exception with JWT_EXPIRED for expired JWT', async () => {
			// Create a token that expires in 1 second
			const token = await signJWT(testSecret, {}, 1);

			// Wait for the token to expire
			await Bun.sleep(1100);

			try {
				await verifyJWT(token, testSecret);
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).message).toBe('JWT token has expired');
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_EXPIRED);
			}
		});

		test('should verify JWT with valid nbf (not before)', async () => {
			// In our current implementation, nbf is set to current time, so this mainly tests the verification logic
			const token = await signJWT(testSecret, {});

			const result = await verifyJWT(token, testSecret);
			expect(result.payload.nbf).toBeTypeOf('number'); // Should be valid since nbf is current time
		});

		test('should handle JWT with all standard claims', async () => {
			const payload: JWTPayload = {
				iss: 'Test-Issuer',
				sub: 'test-subject',
				aud: ['test-audience'],
				userId: 1111
			};
			const token = await signJWT(testSecret, payload);

			const result = await verifyJWT(token, testSecret);
			expect(result.payload.iss).toBe('Test-Issuer');
			expect(result.payload.sub).toBe('test-subject');
			expect(result.payload.aud).toEqual(['test-audience']);
			expect(result.payload.userId).toBe(1111);
		});

		test('should validate issuer when provided in options', async () => {
			const token = await signJWT(testSecret, { sub: 'test-user' });

			// Correct issuer should pass
			const result = await verifyJWT(token, testSecret, { issuer: 'DWS-Issuer' });
			expect(result.payload.sub).toBe('test-user');

			// Wrong issuer should throw
			try {
				await verifyJWT(token, testSecret, { issuer: 'Wrong-Issuer' });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_UNAUTHORIZED);
			}
		});

		test('should validate audience when provided in options', async () => {
			const token = await signJWT(testSecret, { sub: 'test-user' });

			// Correct audience should pass
			const result = await verifyJWT(token, testSecret, { audience: 'DWS-Audience' });
			expect(result.payload.sub).toBe('test-user');

			// Wrong audience should throw
			try {
				await verifyJWT(token, testSecret, { audience: 'Wrong-Audience' });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_UNAUTHORIZED);
			}
		});
	});

	describe('integration scenarios', () => {
		test.each([
			{ name: 'string values', payload: { name: 'John Doe', role: 'admin' } },
			{ name: 'numeric values', payload: { userId: 12345, score: 98.5 } },
			{ name: 'boolean values', payload: { isActive: true, isVerified: false } },
			{ name: 'array values', payload: { permissions: ['read', 'write'], tags: [1, 2, 3] } },
			{ name: 'null values', payload: { optionalField: null, userId: 555 } },
			{
				name: 'mixed types',
				payload: {
					userId: 888,
					name: 'Test User',
					isActive: true,
					permissions: ['admin'],
					metadata: null
				}
			}
		])('should handle complete sign and verify cycle with $name', async ({ payload }) => {
			const token = await signJWT(testSecret, payload);
			const result = await verifyJWT(token, testSecret);

			// Check each property of the payload
			for (const [key, value] of Object.entries(payload))
				expect(result.payload[key]).toEqual(value);
		});

		test('should return consistent payload across multiple verifications', async () => {
			const originalPayload: JWTPayload = {
				userId: 2222,
				sessionId: 'sess_12345',
				createdAt: Date.now()
			};

			// Sign token with 1 hour expiration
			const token = await signJWT(testSecret, originalPayload, ONE_HOUR);

			// Verify multiple times in parallel
			const results = await Promise.all(
				Array.from({ length: 5 }, () => verifyJWT(token, testSecret))
			);

			for (const result of results) {
				expect(result.payload.userId).toBe(2222);
				expect(result.payload.sessionId).toBe('sess_12345');
				expect(result.payload.createdAt).toBe(originalPayload.createdAt);
			}
		});

		test('should handle numeric expiration consistently', async () => {
			const token1 = await signJWT(testSecret, {}, ONE_HOUR);
			const token2 = await signJWT(testSecret, {}, ONE_HOUR);

			const result1 = await verifyJWT(token1, testSecret);
			const result2 = await verifyJWT(token2, testSecret);

			const exp1 = result1.payload.exp ?? 0;
			const exp2 = result2.payload.exp ?? 0;

			expect(Math.abs(exp1 - exp2)).toBeLessThan(2);
		});
	});

	describe('signJWT secret validation', () => {
		test('should throw Exception with JWT_SECRET_TOO_WEAK when secret is too short', async () => {
			const shortSecret = 'too-short-secret';

			try {
				await signJWT(shortSecret, { sub: 'test' });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).message).toBe(
					'Secret key must be at least 32 characters long'
				);
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_SECRET_TOO_WEAK);
				expect((error as Exception).cause).toEqual({ providedLength: shortSecret.length });
			}
		});

		test('should throw Exception with JWT_SECRET_TOO_WEAK when secret has 31 characters', async () => {
			const shortSecret = 'a'.repeat(31);

			try {
				await signJWT(shortSecret, { sub: 'test' });
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(Exception);
				expect((error as Exception).message).toBe(
					'Secret key must be at least 32 characters long'
				);
				expect((error as Exception).key).toBe(JWT_ERROR_KEYS.JWT_SECRET_TOO_WEAK);
				expect((error as Exception).cause).toEqual({ providedLength: shortSecret.length });
			}
		});

		test('should accept secret with exactly 32 characters', async () => {
			const validSecret = 'a'.repeat(32);
			const token = await signJWT(validSecret, { sub: 'test' });

			expect(token).toBeTypeOf('string');
			expect(token.split('.')).toHaveLength(3);
		});
	});
});
