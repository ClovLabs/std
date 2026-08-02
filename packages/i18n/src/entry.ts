import type { HttpStatusCode, HttpStatusKey } from './constant/http-status-codes';
import type { ExceptionEntry } from './exception/type/exception-entry';
import type { MessageEntry } from './message/type/message-entry';
import type { Translations } from './type/translations';

/**
 * Creates a single catalog entry for `defineExceptionCatalog` or `defineMessageCatalog`.
 *
 * With a `status` the entry is an {@link ExceptionEntry} and yields a
 * `LocalizedHttpException`; without one it is a {@link MessageEntry} and yields a plain
 * `LocalizedException`. Translations are captured as literals, so interpolation params
 * are inferred from their `{{placeholder}}` tokens.
 *
 * @param definition - Translations, plus a status for an HTTP exception entry.
 *
 * @returns The definition object, narrowed by the presence of `status`.
 */
export function entry<const TTranslations extends Translations>(definition: {
	readonly status: HttpStatusKey | HttpStatusCode;
	readonly translations: TTranslations;
}): ExceptionEntry<TTranslations>;

export function entry<const TTranslations extends Translations>(definition: {
	readonly translations: TTranslations;
}): MessageEntry<TTranslations>;

export function entry<const TTranslations extends Translations>(definition: {
	readonly status?: HttpStatusKey | HttpStatusCode;
	readonly translations: TTranslations;
}): ExceptionEntry<TTranslations> | MessageEntry<TTranslations> {
	return definition;
}
