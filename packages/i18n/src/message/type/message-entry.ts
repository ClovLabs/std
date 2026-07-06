import type { Translations } from '#/type/translations';

/**
 * Blueprint for a translatable message.
 *
 * Used inside a message catalog created with `defineMessageCatalog`.
 * Interpolation params are derived from the `{{placeholder}}` tokens in
 * `translations`, so there is nothing extra to declare.
 *
 * @template TTranslations - Locale-to-template map (e.g. `{ en: 'Hi {{name}}' }`).
 */
export interface MessageEntry<TTranslations extends Translations = Translations> {
	/** Translated strings keyed by locale. */
	readonly translations: TTranslations;
}
