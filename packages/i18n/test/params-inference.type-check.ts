/**
 * Compile-time guard for `{{placeholder}}` → params inference.
 *
 * Not a runtime test (bun ignores it); `bunx tsc --noEmit` fails if the
 * derivation in `ParamsOf`/`CatalogFactory` regresses to a loose `Record`.
 */
import { entry } from '#/entry';
import { defineExceptionCatalog } from '#/exception/define-exception-catalog';
import { defineMessageCatalog } from '#/message/define-message-catalog';

const errors = defineExceptionCatalog({
	defaultLocale: 'en',
	definitions: {
		noParam: entry({ status: 'NOT_FOUND', translations: { en: 'Not found' } }),
		withId: entry({ status: 'BAD_REQUEST', translations: { en: 'Bad {{id}}' } })
	}
});

const messages = defineMessageCatalog({
	defaultLocale: 'en',
	definitions: {
		range: entry({ translations: { en: 'From {{min}} to {{max}}' } })
	}
});

// Placeholders derived correctly.
errors.noParam();
errors.withId({ id: '1' });
messages.range({ min: '1', max: '9' });

// @ts-expect-error a no-placeholder entry takes no params.
errors.noParam({ id: '1' });
// @ts-expect-error the `id` param is required.
errors.withId();
// @ts-expect-error unknown param key is rejected.
errors.withId({ nope: '1' });
// @ts-expect-error every derived param is required.
messages.range({ min: '1' });
