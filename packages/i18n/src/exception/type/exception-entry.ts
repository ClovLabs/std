import type { HttpStatusCode, HttpStatusKey } from '@clov-std/error';

import type { Translations } from '../../type/translations';

/**
 * Blueprint for a translatable HTTP exception.
 *
 * Used inside an exception catalog created with `defineExceptionCatalog`.
 * Interpolation params are derived from the `{{placeholder}}` tokens in
 * `translations`, so there is nothing extra to declare.
 *
 * @template TTranslations - Locale-to-template map (e.g. `{ en: 'Bad {{id}}' }`).
 */
export interface ExceptionEntry<TTranslations extends Translations = Translations> {
	/** HTTP status to attach (key name like `'NOT_FOUND'` or numeric code like `404`). */
	readonly status: HttpStatusKey | HttpStatusCode;

	/** Translated error messages keyed by locale. */
	readonly translations: TTranslations;
}
