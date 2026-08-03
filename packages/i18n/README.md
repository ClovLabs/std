<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/i18n/logo-i18n.png" alt="Clov I18n logo" width="200" />
</p>

# 🌐 Clov I18n

Type-safe internationalization for TypeScript.
Define your translation catalogs once, and get localized messages and throwable exceptions, all validated at compile time.

## Why this package?

Internationalization is often treated as an afterthought, strings scattered across files, parameters interpolated by hand, no type safety.  
This package takes a different approach: you declare structured catalogs with `entry()`, and the compiler does the rest.  
Parameters, locales, HTTP statuses, if something's wrong, you'll know before your code even runs.

It also plays nicely with `@clov-std/error`. Exception catalogs produce throwable exceptions that carry their own
translations and error key, so your error handling stays consistent: declare a `status` on an entry and you get a
`LocalizedHttpException` ready for an API response, omit it and you get a plain `LocalizedException` for
applications with no HTTP layer.

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
- 🤝 **Locale negotiation** : `defineLocaleNegotiator` turns a raw `Accept-Language` header into one of your catalog locales, quality values included.
- 🚨 **Localized exceptions** : `defineExceptionCatalog` gives you factory functions that create throwable exceptions, with a status code when the entry declares one.
- 💬 **Localized messages** : `defineMessageCatalog` does the same for plain messages : confirmations, notifications, anything that isn't an error.
- 🔗 **Template interpolation** : Use `{{param}}` placeholders in translations; `resolveMessage` fills them in.
- 🔑 **Stable error codes** : Every exception carries its definition key as `code`, inherited from `@clov-std/error`, so handlers branch on `error.code`.

## 🔧 Installation

```bash
bun add @clov-std/i18n
```

> **Peer dependency:** `@clov-std/error` must be installed alongside.

## ⚙️ Usage

### Defining entries

`entry()` is the building block. Give it a `status` and it becomes an exception entry; leave `status` out and it's a plain message entry.

```ts
import { entry } from '@clov-std/i18n';

// This will produce a LocalizedHttpException when used in an exception catalog
const unauthorized = entry({
	status: 'UNAUTHORIZED',
	translations: {
		en: 'Invalid credentials',
		fr: 'Identifiants invalides'
	}
});

// This will produce a plain LocalizedMessage when used in a message catalog.
// The `{{name}}` param is inferred from the template, no type argument needed.
const welcome = entry({
	translations: {
		en: 'Welcome, {{name}}!',
		fr: 'Bienvenue, {{name}} !'
	}
});
```

### Exception catalogs

Group related exception entries into a catalog. Each key becomes a factory function you can call to throw a localized exception, and is used as the exception's error `key`.

```ts
import { defineExceptionCatalog, entry } from '@clov-std/i18n';

const AUTH_ERRORS = defineExceptionCatalog({
	defaultLocale: 'en',
	definitions: {
		invalidCredentials: entry({
			status: 'UNAUTHORIZED',
			translations: {
				en: 'Invalid credentials',
				fr: 'Identifiants invalides'
			}
		}),
		emailTaken: entry({
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

// Params are inferred from the `{{email}}` placeholder, type-checked so you can't forget one
throw AUTH_ERRORS.emailTaken({ email: 'user@example.com' });
```

Omit `status` and the entry produces a plain `LocalizedException` instead, for a worker, a CLI, or any
application that has no HTTP status to return. Both kinds can live in the same catalog, and the return
type of each factory tells you which one you get.

```ts
const JOB_ERRORS = defineExceptionCatalog({
	defaultLocale: 'en',
	definitions: {
		cancelled: entry({
			translations: {
				en: 'Job {{id}} was cancelled',
				fr: 'La tâche {{id}} a été annulée'
			}
		})
	}
});

// LocalizedException: same key, same translations, no httpStatusCode
throw JOB_ERRORS.cancelled({ id: '42' });
```

### Message catalogs

Same idea, but for things that aren't errors, success confirmations, notifications, labels, etc.

```ts
import { defineMessageCatalog, entry } from '@clov-std/i18n';

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

> **Locale consistency is enforced at compile time.** Every entry in a catalog must
> cover the same set of locales - if one entry declares `de`, they all must, or `tsc`
> errors on the entry that's missing it. No more silently untranslated locales.

### Resolving to a specific locale

`resolveMessage` takes a `LocalizedException` (HTTP or not) or a `LocalizedMessage` and returns the interpolated string for the locale you want.

```ts
import { resolveMessage } from '@clov-std/i18n';

const error = AUTH_ERRORS.emailTaken({ email: 'a@b.com' });

resolveMessage(error); // default locale → "Email "a@b.com" is already taken"
resolveMessage(error, 'fr'); // → "L'email "a@b.com" est déjà utilisé"
```

### Negotiating the locale from a request

`resolveMessage` expects a single locale, and a raw `Accept-Language` header is not one:
`fr-CA,fr;q=0.9,en;q=0.8` matches no catalog key, so every message silently falls back to the
default locale. `defineLocaleNegotiator` closes that gap.

```ts
import { defineLocaleNegotiator } from '@clov-std/i18n';

const negotiateLocale = defineLocaleNegotiator({
	supported: ['en', 'fr', 'it'],
	fallback: 'en'
});

negotiateLocale('fr-CA,fr;q=0.9,en;q=0.8'); // → 'fr'
negotiateLocale('it;q=0.5,fr;q=0.9'); // → 'fr', quality values beat header order
negotiateLocale('fr;q=0,it'); // → 'it', q=0 explicitly refuses a locale
negotiateLocale('ja'); // → 'en', nothing acceptable
negotiateLocale(); // → 'en'
```

Define it once, then feed it to `resolveMessage` wherever a request is handled.

```ts
const lang = negotiateLocale(request.headers.get('accept-language') ?? undefined);

resolveMessage(error, lang);
```

The return type is narrowed to `'en' | 'fr' | 'it'`, so a locale none of your catalogs cover
can't reach `resolveMessage` in the first place.

> **Keep `supported` lowercase.** Ranges are matched case-insensitively against it, each one
> as a whole tag (`pt-br`) before its language subtag (`pt`).

> **Responses that vary by locale need `Vary: Accept-Language`.** Without it a shared cache
> keys on the URL alone and will serve one visitor's language to the next.

## 📚 API Reference

Full docs: [https://clovlabs.github.io/std/](https://clovlabs.github.io/std/)

## ⚖️ License

MIT - Feel free to use it.

## 📧 Contact

- GitHub: [ClovLabs](https://github.com/ClovLabs/packages)
