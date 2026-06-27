<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/Dominus-Web-Service/std@main/packages/i18n/logo-i18n.png" alt="DWS I18n logo" width="200" />
</p>

# 🌐 DWS I18n

Type-safe internationalization for TypeScript.
Define your translation catalogs once, and get localized messages and HTTP exceptions with full traceability, all validated at compile time.

## Why this package?

Internationalization is often treated as an afterthought, strings scattered across files, parameters interpolated by hand, no type safety.  
This package takes a different approach: you declare structured catalogs with `entry()`, and the compiler does the rest.  
Parameters, locales, HTTP statuses, if something's wrong, you'll know before your code even runs.

It also plays nicely with `@dws-std/error`. Exception catalogs produce `LocalizedHttpException` instances that carry translations,
a UUID v7, and an HTTP status code, so your error handling stays consistent and traceable.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🔒 **Type-safe catalogs** : Parameters, locales, and HTTP status are all validated at compile time thanks to `entry()`.
- 🌍 **Multi-locale** : Each entry holds all its translations; pick the right one at call-time.
- 🚨 **Localized exceptions** : `defineExceptionCatalog` gives you factory functions that create `LocalizedHttpException` instances, complete with status codes and UUID tracking.
- 💬 **Localized messages** : `defineMessageCatalog` does the same for plain messages : confirmations, notifications, anything that isn't an error.
- 🔗 **Template interpolation** : Use `{{param}}` placeholders in translations; `resolveMessage` fills them in.
- 🔍 **UUID v7 tracking** : Every exception inherits traceability from `@dws-std/error`.

## 🔧 Installation

```bash
bun add @dws-std/i18n
```

> **Peer dependency:** `@dws-std/error` must be installed alongside.

## ⚙️ Usage

### Defining entries

`entry()` is the building block. Give it a `status` and it becomes an exception entry; leave `status` out and it's a plain message entry.

```ts
import { entry } from '@dws-std/i18n';

// This will produce a LocalizedHttpException when used in an exception catalog
const unauthorized = entry({
	status: 'UNAUTHORIZED',
	translations: {
		en: 'Invalid credentials',
		fr: 'Identifiants invalides'
	}
});

// This will produce a plain LocalizedMessage when used in a message catalog
const welcome = entry<{ name: string }>({
	translations: {
		en: 'Welcome, {{name}}!',
		fr: 'Bienvenue, {{name}} !'
	}
});
```

### Exception catalogs

Group related exception entries under a namespace. Each key becomes a factory function you can call to throw a localized exception.

```ts
import { defineExceptionCatalog, entry } from '@dws-std/i18n';

const AUTH_ERRORS = defineExceptionCatalog({
	namespace: 'auth',
	defaultLocale: 'en',
	definitions: {
		invalidCredentials: entry({
			status: 'UNAUTHORIZED',
			translations: {
				en: 'Invalid credentials',
				fr: 'Identifiants invalides'
			}
		}),
		emailTaken: entry<{ email: string }>({
			status: 'CONFLICT',
			translations: {
				en: 'Email "{{email}}" is already taken',
				fr: 'L\'email "{{email}}" est déjà utilisé'
			}
		})
	}
});

// Throws a LocalizedHttpException with status 401
throw AUTH_ERRORS.invalidCredentials();

// With parameters, type-checked, so you can't forget one
throw AUTH_ERRORS.emailTaken({ email: 'user@example.com' });
```

### Message catalogs

Same idea, but for things that aren't errors, success confirmations, notifications, labels, etc.

```ts
import { defineMessageCatalog, entry } from '@dws-std/i18n';

const DNS_MESSAGES = defineMessageCatalog({
	defaultLocale: 'en',
	definitions: {
		recordCreated: entry({
			translations: {
				en: 'DNS record created successfully',
				fr: 'Enregistrement DNS créé avec succès'
			}
		})
	}
});

const msg = DNS_MESSAGES.recordCreated();
```

### Resolving to a specific locale

`resolveMessage` takes a `LocalizedHttpException` or a `LocalizedMessage` and returns the interpolated string for the locale you want.

```ts
import { resolveMessage } from '@dws-std/i18n';

const error = AUTH_ERRORS.emailTaken({ email: 'a@b.com' });

resolveMessage(error); // default locale → "Email "a@b.com" is already taken"
resolveMessage(error, 'fr'); // → "L'email "a@b.com" est déjà utilisé"
```

## 📚 API Reference

Full docs: [https://dominus-web-service.github.io/std/](https://dominus-web-service.github.io/std/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [Dominus-Web-Service](https://github.com/Dominus-Web-Service/packages)
