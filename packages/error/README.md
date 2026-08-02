<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/error/logo-error.png" alt="Clov Error logo" width="200" />
</p>

# 🐞 Clov Error

If you've ever debugged a production incident with nothing but a generic `Error("something went wrong")`,
you know the pain.  
This package gives your errors structure, every exception carries a machine-readable `key`,
so you can always branch on what happened instead of grepping a message string.

## Why this package?

Vanilla `Error` objects lack context.  
Catching one leaves you matching on `error.message` strings, which breaks the day someone rewords the message.

`@clov-std/error` solves that with one class:

- **`Exception`** - a richer base error carrying a stable `key` and a typed `cause`.

The `key` is the point. A low-level library can throw `Exception` with `key: 'jwt.expired'` without knowing anything
about HTTP status codes or locales, and the layer that _does_ know (your API, your i18n catalog) maps that key to a
status and a translated message. One direction of dependency, no HTTP concern leaking into a token signer.

No dependencies, no bloat. Just structured errors that make your life easier.

> Looking for HTTP status codes and localized messages? That's [`@clov-std/i18n`](https://www.npmjs.com/package/@clov-std/i18n),
> whose `LocalizedHttpException` extends `Exception`.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🔑 **Stable Error Keys** : Branch on `error.key`, never on `error.message`.
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
	key: 'config.notFound'
});
```

The `key` is what callers should switch on:

```ts
try {
	await verifyToken(token);
} catch (err) {
	if (err instanceof Exception && err.key === 'jwt.expired') return refresh();
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

### HTTP and localized errors

`Exception` deliberately knows nothing about HTTP. When you need a status code and a translated message,
use `LocalizedHttpException` from [`@clov-std/i18n`](https://www.npmjs.com/package/@clov-std/i18n), which extends
this class, so a single `catch (err) { if (err instanceof Exception) ... }` still covers both.

## 📚 API Reference

Full docs: [https://clovlabs.github.io/std/](https://clovlabs.github.io/std/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [ClovLabs](https://github.com/ClovLabs/packages)
