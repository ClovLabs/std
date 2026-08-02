import type { HttpStatusCode, HttpStatusKey } from '../../constant/http-status-codes';
import type { Translations } from '../../type/translations';

/**
 * Blueprint for a translatable HTTP exception, used inside `defineExceptionCatalog`.
 *
 * @template TTranslations - Locale-to-template map (e.g. `{ en: 'Bad {{id}}' }`).
 */
export interface ExceptionEntry<TTranslations extends Translations = Translations> {
	/** HTTP status to attach (key name like `'NOT_FOUND'` or numeric code like `404`). */
	readonly status: HttpStatusKey | HttpStatusCode;

	/** Translated error messages keyed by locale. */
	readonly translations: TTranslations;
}
