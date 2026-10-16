<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/i18n/logo-i18n.png" alt="Clov I18n logo" width="200" />
</p>

# Clov I18n

Translation catalogs checked by the compiler. You declare each message once with all its translations, and `tsc` tells you when a locale is missing or a `{{param}}` isn't passed.

Catalogs come in two kinds:

- Exception catalogs give you factories that build throwable exceptions. Built on `@clov-std/error`, so each one carries its catalog key as `code`.
- Message catalogs do the same for everything that isn't an error: confirmations, notifications, labels.

```bash
bun add @clov-std/i18n @clov-std/error
```

`@clov-std/error` is a peer dependency.

## Entries

`entry()` is the building block. With a `status` it's meant for an exception catalog, without one it's a plain message.

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

## Exception catalogs

Each key becomes a factory, and is also the exception's `code`.

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

// A LocalizedHttpException with status 401
const invalid = AUTH_ERRORS.invalidCredentials();

// Params are inferred from the `{{email}}` placeholder, type-checked so you can't forget one
throw AUTH_ERRORS.emailTaken({ email: 'user@example.com' });
```

Leave out `status` and the factory returns a plain `LocalizedException`, for a worker, a CLI, or anything with no HTTP status to return. Both kinds can sit in the same catalog, and each factory's return type tells you which one you get.

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

## Message catalogs

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

Every entry in a catalog must cover the same locales. If one declares `de`, they all have to, otherwise `tsc` flags the entry that's missing it.

## Resolving a message

`resolveMessage` takes a `LocalizedException` (HTTP or not) or a `LocalizedMessage`, and returns the interpolated string for a locale.

```ts
import { resolveMessage } from '@clov-std/i18n';

const error = AUTH_ERRORS.emailTaken({ email: 'a@b.com' });

resolveMessage(error); // default locale → "Email "a@b.com" is already taken"
resolveMessage(error, 'fr'); // → "L'email "a@b.com" est déjà utilisé"
```

## Picking the locale from a request

`resolveMessage` wants one locale, and a raw `Accept-Language` like `fr-CA,fr;q=0.9,en;q=0.8` doesn't match any catalog key, so everything would quietly fall back to the default. `defineLocaleNegotiator` handles that, quality values included:

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

Define it once and use it wherever you handle a request:

```ts
const lang = negotiateLocale(request.headers.get('accept-language') ?? undefined);

resolveMessage(error, lang);
```

The return type is narrowed to `'en' | 'fr' | 'it'`, so a locale your catalogs don't cover can't reach `resolveMessage`.

A couple of things to know:

- Keep `supported` lowercase. Ranges are matched case-insensitively, the full tag first (`pt-br`), then the language (`pt`).
- If a response depends on the locale, send `Vary: Accept-Language`. Otherwise a shared cache keys on the URL alone and serves one visitor's language to the next.

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
