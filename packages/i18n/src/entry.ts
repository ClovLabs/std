import type { HttpStatusCode, HttpStatusKey } from '@dws-std/error';

import type { ExceptionEntry } from './exception/type/exception-entry';
import type { MessageEntry } from './message/type/message-entry';
import type { Translations } from './type/translations';

/**
 * Creates a single catalog entry for use inside `defineExceptionCatalog` or `defineMessageCatalog`.
 *
 * When `status` is included in the definition the return type narrows to
 * {@link ExceptionEntry}; without it the return type is {@link MessageEntry}.
 * Translations are captured as literals so interpolation params can be inferred
 * from their `{{placeholder}}` tokens - no type arguments needed.
 *
 * @param definition - Translations (and optional status) for this entry.
 *
 * @returns The definition object, typed as either {@link ExceptionEntry} or {@link MessageEntry} based on the presence of `status`.
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
