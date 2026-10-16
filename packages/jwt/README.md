<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/jwt/logo-jwt.png" alt="Clov JWT logo" width="200" />
</p>

# Clov JWT

Two functions on top of [jose](https://github.com/panva/jose): sign and verify HS256 tokens with the standard claims filled in for you.

```bash
bun add @clov-std/jwt
```

## `signJWT`

Signs a payload and returns the token. `iss`, `sub`, `aud`, `nbf`, `iat` and `exp` are set for you, so you only pass your own data. The defaults are `iss: 'Clov-Issuer'`, `sub: ''` and `aud: ['Clov-Audience']`, which you'll probably want to override (see below).

```ts
import { signJWT } from '@clov-std/jwt';

// Default expiration: 15 minutes
const token = await signJWT(secret, { userId: 42, role: 'admin' });

// Expires in one hour (offset in seconds)
const longerToken = await signJWT(secret, { userId: 42 }, 3600);
```

The secret must be at least 32 characters. A shorter one throws right away, so you find out at startup rather than in production.

Any default claim can be overridden from the payload:

```ts
const token = await signJWT(secret, {
	iss: 'my-service',
	sub: 'user-123',
	aud: ['my-api'],
	userId: 42
});
```

## `verifyJWT`

Returns the decoded payload, or throws.

```ts
import { verifyJWT } from '@clov-std/jwt';

const { payload } = await verifyJWT(token, secret);
console.log(payload.userId);
```

`iss` and `aud` can be checked too:

```ts
const { payload } = await verifyJWT(token, secret, {
	issuer: 'my-service',
	audience: 'my-api'
});
```

## Errors

Everything thrown is an `Exception` from `@clov-std/error`:

| Code                     | Constant                             | When                                                            |
| ------------------------ | ------------------------------------ | --------------------------------------------------------------- |
| `jwt.secret.too-weak`    | `JWT_ERROR_CODES.SECRET_TOO_WEAK`    | Secret is shorter than 32 characters                            |
| `jwt.expiration.in-past` | `JWT_ERROR_CODES.EXPIRATION_IN_PAST` | Expiration is in the past or equals now                         |
| `jwt.signing.failed`     | `JWT_ERROR_CODES.SIGNING_FAILED`     | jose failed to sign the token                                   |
| `jwt.token.expired`      | `JWT_ERROR_CODES.TOKEN_EXPIRED`      | Token is valid but past its expiry date                         |
| `jwt.token.invalid`      | `JWT_ERROR_CODES.TOKEN_INVALID`      | Invalid signature, malformed token, or claim validation failure |

```ts
import { Exception } from '@clov-std/error';
import { JWT_ERROR_CODES, verifyJWT } from '@clov-std/jwt';

try {
	const { payload } = await verifyJWT(token, secret);
} catch (error) {
	if (error instanceof Exception) {
		if (error.code === JWT_ERROR_CODES.TOKEN_EXPIRED) {
			// Token expired, trigger a refresh
		}
		// Everything else is unauthorized
	}
}
```

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
