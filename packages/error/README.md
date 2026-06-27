<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/Dominus-Web-Service/std@main/packages/error/logo-error.png" alt="DWS Error logo" width="200" />
</p>

# 🐞 DWS Error

If you've ever debugged a production incident with nothing but a generic `Error("something went wrong")`,
you know the pain.  
This package gives your errors structure, every exception carries a UUID v7, a timestamp, and an optional HTTP status code,
so you can always trace what happened and when.

## Why this package?

Vanilla `Error` objects lack context.  
You end up manually adding IDs, timestamps, and status codes everywhere, or worse, you don't, and debugging becomes a guessing game.

`@dws-std/error` solves that with two classes:

- **`Exception`** - a richer base error with automatic UUID v7 tracking, timestamps, and an optional error code.
- **`HttpException`** - extends `Exception` with an HTTP status code, perfect for API error responses.

No dependencies, no bloat. Just structured errors that make your life easier.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🔍 **UUID v7 Tracking** : Every exception gets a unique, time-sortable ID out of the box.
- 📅 **Built-in Context** : Timestamp, error code, and cause are baked into each instance.
- 🌐 **HTTP-Aware** : `HttpException` maps to any standard HTTP status for clean API responses.
- 📦 **Zero Dependencies** : Pure TypeScript, tiny footprint.

## 🔧 Installation

```bash
bun add @dws-std/error
```

## ⚙️ Usage

### Exception - General-Purpose Errors

Use `Exception` whenever you need a traceable error with more context than a plain `Error`.

```ts
import { Exception } from '@dws-std/error';

throw new Exception('Configuration file not found', {
	code: 'CONFIG_NOT_FOUND'
});
```

Every instance automatically carries a `uuid` and a `date`, so you can correlate it in your logs without any extra work.

You can also wrap a root cause to preserve the original error:

```ts
import { Exception } from '@dws-std/error';

try {
	await db.save(user);
} catch (err) {
	throw new Exception('Failed to persist user', { cause: err });
}
```

### HttpException - API Errors

When you're building an API and need an error tied to an HTTP status code, reach for `HttpException`.  
Pass a status key like `'BAD_REQUEST'` or a numeric code like `400`, both work.

```ts
import { HttpException } from '@dws-std/error';

throw new HttpException('Invalid email address', {
	status: 'BAD_REQUEST',
	code: 'INVALID_EMAIL'
});
```

If you don't specify a status, it defaults to `500 Internal Server Error`, so unexpected failures are covered too:

```ts
import { HttpException } from '@dws-std/error';

throw new HttpException('Something broke');
```

## 📚 API Reference

Full docs: [https://dominus-web-service.github.io/std/](https://dominus-web-service.github.io/std/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [Dominus-Web-Service](https://github.com/Dominus-Web-Service/packages)
