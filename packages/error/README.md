<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/error/logo-error.png" alt="Clov Error logo" width="200" />
</p>

# 🐞 Clov Error

If you've ever debugged a production incident with nothing but a generic `Error("something went wrong")`,
you know the pain.  
This package gives your errors structure, every exception carries a machine-readable `code`,
so you can always branch on what happened instead of grepping a message string.

## Why this package?

Vanilla `Error` objects lack context.  
Catching one leaves you matching on `error.message` strings, which breaks the day someone rewords the message.

`@clov-std/error` solves that with two classes:

- **`Exception`** - a richer base error carrying a stable `code` and a typed `cause`.
- **`HttpException`** - the same, plus a resolved HTTP `status`.

The `code` is the point. A low-level library throws `Exception` with `code: 'jwt.token.expired'` without knowing
anything about transports or locales, and the layer that _does_ know maps that code to a wire format. One direction
of dependency, no HTTP concern leaking into a token signer.

No dependencies, no bloat. Just structured errors that make your life easier.

> Looking for localized messages? That's [`@clov-std/i18n`](https://www.npmjs.com/package/@clov-std/i18n).

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🔑 **Stable Error Codes** : Branch on `error.code`, never on `error.message`.
- 🌐 **HTTP When You Need It** : `HttpException` resolves a status from a name (`'NOT_FOUND'`) or a number.
- 🔗 **Typed Cause** : `cause` keeps its shape through the generic, so wrapping an error doesn't lose its type.
- 🧹 **Clean Stack Traces** : The constructor frame is stripped, and `name` reflects the actual subclass.
- 📦 **Zero Dependencies** : Pure TypeScript, no runtime globals, tiny footprint.

## 🔧 Installation

```bash
bun add @clov-std/error
```

## ⚙️ Usage

### Exception - General-Purpose Errors

Use `Exception` whenever you need a traceable error with more context than a plain `Error`.

```ts
import { Exception } from '@clov-std/error';

throw new Exception('Configuration file not found', {
	code: 'config.file.not-found'
});
```

The `code` is what callers should switch on:

```ts
try {
	await verifyToken(token);
} catch (err) {
	if (err instanceof Exception && err.code === 'jwt.token.expired') return refresh();
	throw err;
}
```

You can also wrap a root cause to preserve the original error:

```ts
import { Exception } from '@clov-std/error';

try {
	await db.save(user);
} catch (err) {
	throw new Exception('Failed to persist user', { cause: err });
}
```

### What's deliberately not here

No request id, no timestamp. Both belong to the layer that _handles_ the error: a request handler
already has an `x-request-id` (or mints one), and a log sink already stamps every line with a time.
Putting them on the error means every throw pays for identity nobody reads.

If an application genuinely needs them on the instance, that's a subclass:

```ts
class TracedException extends Exception {
	public readonly uuid: string = crypto.randomUUID();
	public readonly date: Date = new Date();
}
```

### HttpException - Errors Bound to a Status

When a failure has a status, throw `HttpException`. It takes a status name or a number, and resolves it
to `error.status`:

```ts
import { HttpException } from '@clov-std/error';

throw new HttpException('Account not found', {
	code: 'auth.account.not-found',
	status: 'NOT_FOUND' // or 404
});
```

`status` is required on purpose: an HTTP exception without one is a bug, and a silent `500` would hide it.

Nothing about RFC 9457 lives here. Your presentation layer maps `code` to the wire format it needs,
which keeps this package usable from a CLI or a worker:

```ts
// One adapter, at the boundary
problem({ type: error.code, status: error.status, detail: error.message });
```

For translated messages, `@clov-std/i18n` builds on `Exception` with catalogs of localized templates.

## 📚 API Reference

Full docs: [https://clovlabs.github.io/std/](https://clovlabs.github.io/std/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [ClovLabs](https://github.com/ClovLabs/packages)
