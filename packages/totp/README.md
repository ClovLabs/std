<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/Dominus-Web-Service/std@main/packages/totp/logo-totp.png" alt="DWS TOTP logo" width="200" />
</p>

# 🔐 DWS TOTP

Generate and verify HOTP and TOTP codes with sensible defaults.

`@dws-std/totp` supports base32 secrets, raw byte secrets, custom digits, custom algorithms, verification windows, secret generation, `otpauth://` provisioning URIs, and structured errors via `@dws-std/error`.

## 📌 Table of Contents

- [Installation](#-installation)
- [Usage](#-usage)
    - [generateHOTP](#generatehotp)
    - [verifyHOTP](#verifyhotp)
    - [generateTOTP](#generatetotp)
    - [verifyTOTP](#verifytotp)
    - [generateOTPSecret](#generateotpsecret)
    - [buildOtpauthUrl](#buildotpauthurl)
- [Error handling](#-error-handling)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## 🔧 Installation

```bash
bun add @dws-std/totp
```

## ⚙️ Usage

### `generateHOTP`

Generates an HOTP code from a secret and a counter.

```ts
import { generateHOTP } from '@dws-std/totp';

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

### `verifyHOTP`

Verifies an HOTP code for a given counter. Use `window` to accept future counters.

```ts
import { verifyHOTP } from '@dws-std/totp';

const isValid = await verifyHOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	counter: 42,
	otp: '123456'
});
```

Example with a look-ahead window:

```ts
const isValid = await verifyHOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	counter: 42,
	otp: '123456',
	window: 3
});
```

That checks counters `42`, `43`, `44`, and `45`.

### `generateTOTP`

Generates a TOTP code from a secret and the current time.

```ts
import { generateTOTP } from '@dws-std/totp';

const otp = await generateTOTP({
	secret: 'JBSWY3DPEHPK3PXP'
});
```

By default:

- the period is `30` seconds
- the code length is `6`
- the algorithm is `'SHA-1'`

You can override all of that:

```ts
const otp = await generateTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	period: 60,
	digits: 8,
	algorithm: 'SHA-512'
});
```

You can pass a fixed `time` for tests or reproducible output:

```ts
const otp = await generateTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	time: 1_234_567_890
});
```

### `verifyTOTP`

Verifies a TOTP code for the current time or a provided timestamp.

```ts
import { verifyTOTP } from '@dws-std/totp';

const isValid = await verifyTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	otp: '123456'
});
```

By default, verification uses a `window` of `1`, so it accepts:

- the previous time step
- the current time step
- the next time step

This helps tolerate small clock drift.

You can tighten or widen the range:

```ts
const isValid = await verifyTOTP({
	secret: 'JBSWY3DPEHPK3PXP',
	otp: '123456',
	window: 0,
	period: 30
});
```

### `generateOTPSecret`

Generates a random base32-encoded secret, suitable for both HOTP and TOTP.  
The argument is the number of chars (each carries 5 bits of entropy).

```ts
import { generateOTPSecret } from '@dws-std/totp';

const secret = generateOTPSecret(32);

const otp = await generateTOTP({ secret });
```

### `buildOtpauthUrl`

Builds an `otpauth://` provisioning URI (Key Uri Format) you can encode into a QR code for authenticator apps.  
The `type` field selects between time-based and counter-based credentials.

```ts
import { buildOtpauthUrl, generateOTPSecret } from '@dws-std/totp';

const secret = generateOTPSecret(32);

const url = buildOtpauthUrl({
	type: 'totp',
	secret,
	accountName: 'alice@example.com',
	issuer: 'DWS'
});
// otpauth://totp/DWS%3Aalice%40example.com?secret=...&issuer=DWS&algorithm=SHA1&digits=6&period=30
```

For HOTP, pass a `counter` instead of a `period`:

```ts
const url = buildOtpauthUrl({
	type: 'hotp',
	secret,
	accountName: 'alice@example.com',
	issuer: 'DWS',
	counter: 0
});
// otpauth://hotp/DWS%3Aalice%40example.com?secret=...&issuer=DWS&algorithm=SHA1&digits=6&counter=0
```

`digits` defaults to `6` and `algorithm` to `'SHA-1'`. The algorithm is normalised to the dash-less spelling the URI format expects (`SHA-256` -> `SHA256`).

## 🚨 Error handling

All runtime errors are thrown as `Exception` instances from `@dws-std/error`.

| Key                   | When                                              |
| --------------------- | ------------------------------------------------- |
| `totp.invalid_secret` | The provided secret is empty                      |
| `totp.invalid_digits` | `digits` is outside the supported range           |
| `totp.invalid_period` | `period` is `0` or negative                       |
| `totp.invalid_base32` | A base32 secret contains invalid characters       |
| `totp.hmac_failed`    | The underlying HMAC operation failed unexpectedly |

```ts
import { Exception } from '@dws-std/error';
import { TOTP_ERROR_KEYS, generateTOTP } from '@dws-std/totp';

try {
	const otp = await generateTOTP({
		secret: 'not valid!!!'
	});
} catch (error) {
	if (error instanceof Exception) {
		if (error.key === TOTP_ERROR_KEYS.INVALID_BASE32) {
			// Reject or log the malformed secret
		}
	}
}
```

## 📚 API Reference

Full docs: [https://dominus-web-service.github.io/std/](https://dominus-web-service.github.io/std/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [Dominus-Web-Service](https://github.com/Dominus-Web-Service/packages)
