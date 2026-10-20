<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/totp/logo-totp.svg" alt="Clov TOTP logo" width="200" />
</p>

# Clov TOTP

Generate and verify HOTP and TOTP codes (RFC 4226 / RFC 6238). Secrets can be base32 strings or raw bytes, and you also get secret generation and `otpauth://` URIs for QR codes.

Defaults are what authenticator apps expect: 6 digits, SHA-1, 30-second period.

```bash
bun add @clov-std/totp
```

## `generateHOTP`

Generates an HOTP code from a secret and a counter.

```ts
import { generateHOTP } from '@clov-std/totp';

const otp = await generateHOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	counter: 42
});
```

You can also pass raw bytes instead of a base32 string:

```ts
const secret = new TextEncoder().encode('12345678901234567890');

const otp = await generateHOTP({
	secret,
	counter: 42
});
```

Custom digits and algorithms are also supported:

```ts
const otp = await generateHOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	counter: 42,
	digits: 8,
	algorithm: 'SHA-256'
});
```

## `verifyHOTP`

Verifies an HOTP code for a given counter. Use `window` to accept future counters.

```ts
import { verifyHOTP } from '@clov-std/totp';

const isValid = await verifyHOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	counter: 42,
	otp: '123456'
});
```

With a look-ahead window:

```ts
const isValid = await verifyHOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	counter: 42,
	otp: '123456',
	window: 3
});
```

That checks counters `42`, `43`, `44`, and `45`.

## `generateTOTP`

Generates a TOTP code from a secret and the current time.

```ts
import { generateTOTP } from '@clov-std/totp';

const otp = await generateTOTP({
	secret: 'JBSWY3DPEHPK3PXP'
});
```

All of it can be overridden:

```ts
const otp = await generateTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	period: 60,
	digits: 8,
	algorithm: 'SHA-512'
});
```

A fixed `time` is handy in tests:

```ts
const otp = await generateTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	time: 1_234_567_890
});
```

## `verifyTOTP`

Verifies a TOTP code for the current time or a provided timestamp.

```ts
import { verifyTOTP } from '@clov-std/totp';

const isValid = await verifyTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	otp: '123456'
});
```

The default `window` is `1`: the previous, current and next time steps are accepted, which absorbs a bit of clock drift. Set it to `0` to accept only the current step:

```ts
const isValid = await verifyTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	otp: '123456',
	window: 0,
	period: 30
});
```

## `generateOTPSecret`

Generates a random base32 secret, usable for both HOTP and TOTP. The argument is the length in characters, each one carrying 5 bits of entropy.

```ts
import { generateOTPSecret } from '@clov-std/totp';

const secret = generateOTPSecret(32);

const otp = await generateTOTP({ secret });
```

## `buildOtpauthUrl`

Builds the `otpauth://` URI (Key Uri Format) that authenticator apps scan as a QR code. `type` picks time-based or counter-based.

```ts
import { buildOtpauthUrl, generateOTPSecret } from '@clov-std/totp';

const secret = generateOTPSecret(32);

const url = buildOtpauthUrl({
	type: 'totp',
	secret,
	accountName: 'alice@example.com',
	issuer: 'Clov'
});
// otpauth://totp/Clov%3Aalice%40example.com?secret=...&issuer=Clov&algorithm=SHA1&digits=6&period=30
```

For HOTP, pass a `counter` instead of a `period`:

```ts
const url = buildOtpauthUrl({
	type: 'hotp',
	secret,
	accountName: 'alice@example.com',
	issuer: 'Clov',
	counter: 0
});
// otpauth://hotp/Clov%3Aalice%40example.com?secret=...&issuer=Clov&algorithm=SHA1&digits=6&counter=0
```

`digits` defaults to `6` and `algorithm` to `'SHA-1'`. The algorithm is written without the dash, as the URI format expects (`SHA-256` becomes `SHA256`).

## Errors

Everything thrown is an `Exception` from `@clov-std/error`:

| Code                            | Constant                                      | When                                              |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| `totp.secret.invalid`           | `HOTP_ERROR_CODES.SECRET_INVALID`             | The provided secret is empty                      |
| `totp.digits.invalid`           | `HOTP_ERROR_CODES.DIGITS_INVALID`             | `digits` is outside the supported range           |
| `totp.period.invalid`           | `TOTP_ERROR_CODES.PERIOD_INVALID`             | `period` is `0` or negative                       |
| `totp.base32.invalid-character` | `DECODE_BASE32_ERROR_CODES.INVALID_CHARACTER` | A base32 secret contains invalid characters       |
| `totp.hmac.failed`              | `HOTP_ERROR_CODES.HMAC_FAILED`                | The underlying HMAC operation failed unexpectedly |

```ts
import { Exception } from '@clov-std/error';
import { DECODE_BASE32_ERROR_CODES, generateTOTP } from '@clov-std/totp';

try {
	const otp = await generateTOTP({
		secret: 'not valid!!!'
	});
} catch (error) {
	if (error instanceof Exception) {
		if (error.code === DECODE_BASE32_ERROR_CODES.INVALID_CHARACTER) {
			// Reject or log the malformed secret
		}
	}
}
```

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
