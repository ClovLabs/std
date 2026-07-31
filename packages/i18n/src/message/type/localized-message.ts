import type { Translations } from '../../type/translations';

/**
 * Localized message returned by the factories of `defineMessageCatalog`.
 *
 * Pass it to {@link resolveMessage} to get the final string for a locale.
 */
export interface LocalizedMessage {
	/** All available translations keyed by locale. */
	readonly translations: Translations;

	/** Parameter values to interpolate into `{{placeholder}}` tokens. */
	readonly params?: Readonly<Record<string, string>> | undefined;

	/** Locale used when no explicit locale is passed to `resolveMessage`. */
	readonly defaultLocale: string;
}
