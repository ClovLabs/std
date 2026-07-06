/**
 * Compile-time guard for catalog-wide locale consistency.
 *
 * Not a runtime test (bun ignores it); `bunx tsc --noEmit` fails if the
 * `LocalesOf`/`ConsistentLocales` enforcement stops catching a locale that is
 * present on one entry but missing on another.
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
