import type { Translations } from '../../type/translations';

/**
 * Blueprint for a translatable message, used inside `defineMessageCatalog`.
 *
 * @template TTranslations - Locale-to-template map (e.g. `{ en: 'Hi {{name}}' }`).
 */
export interface MessageEntry<TTranslations extends Translations = Translations> {
	/** Translated strings keyed by locale. */
	readonly translations: TTranslations;
}
