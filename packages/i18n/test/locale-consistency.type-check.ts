/**
 * Compile-time guard for catalog-wide locale consistency and entry exactness.
 *
 * Not a runtime test (bun ignores it); `bunx tsc --noEmit` fails if the
 * `LocalesOf`/`ExactEntries` enforcement stops catching a locale that is
 * present on one entry but missing on another, or a key that doesn't belong
 * on an entry at all.
 */
import { entry } from '#/entry';
import { defineExceptionCatalog } from '#/exception/define-exception-catalog';
import { defineMessageCatalog } from '#/message/define-message-catalog';

// OK — every entry covers en + fr.
defineExceptionCatalog({
	defaultLocale: 'en',
	definitions: {
		notFound: entry({ status: 'NOT_FOUND', translations: { en: 'Nope', fr: 'Non' } }),
		denied: entry({ status: 'FORBIDDEN', translations: { en: 'Denied', fr: 'Refusé' } })
	}
});

defineMessageCatalog({
	defaultLocale: 'en',
	definitions: {
		hi: entry({ translations: { en: 'Hi', fr: 'Salut' } }),
		// @ts-expect-error — 'fr' is missing on this entry.
		bye: entry({ translations: { en: 'Bye' } })
	}
});

defineMessageCatalog({
	defaultLocale: 'en',
	definitions: {
		// @ts-expect-error — the other entry adds 'de', so this one must too.
		a: entry({ translations: { en: 'a', fr: 'a' } }),
		b: entry({ translations: { en: 'b', fr: 'b', de: 'b' } })
	}
});

defineMessageCatalog({
	// @ts-expect-error — defaultLocale must be one of the declared locales.
	defaultLocale: 'jp',
	definitions: {
		a: entry({ translations: { en: 'a', fr: 'a' } })
	}
});

// A raw entry literal (no `entry()` call) carries nothing beyond status + translations.
defineExceptionCatalog({
	defaultLocale: 'en',
	definitions: {
		example: {
			status: 500,
			// @ts-expect-error — `oui` is not part of an entry.
			oui: 3,
			translations: { en: 'An example error occurred.' }
		}
	}
});

// Same on a message entry, where `status` doesn't belong either.
defineMessageCatalog({
	defaultLocale: 'en',
	definitions: {
		hi: {
			// @ts-expect-error — `status` is not part of a message entry.
			status: 500,
			translations: { en: 'Hi' }
		}
	}
});
