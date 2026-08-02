import type { CatalogFactory, ExactEntries, LocalesOf } from '../type/translations';
import type { LocalizedMessage } from './type/localized-message';
import type { MessageEntry } from './type/message-entry';

export type MessageCatalog<TDefs extends Record<string, MessageEntry>> = {
	readonly [K in keyof TDefs]: CatalogFactory<TDefs[K]['translations'], LocalizedMessage>;
};

/**
 * Configuration for {@link defineMessageCatalog}.
 *
 * @template TDefs - Shape of the message definitions map.
 */
export interface DefineMessageCatalogOptions<TDefs extends Record<string, MessageEntry>> {
	/** Locale used when no explicit locale is passed to `resolveMessage`. */
	readonly defaultLocale: LocalesOf<TDefs>;

	/**
	 * Map of message definitions keyed by message name. Every entry must cover the same
	 * locales, and carries nothing beyond its `translations`.
	 */
	readonly definitions: TDefs &
		ExactEntries<TDefs, { readonly translations: Record<LocalesOf<TDefs>, string> }>;
}

/**
 * Builds a typed message catalog from a set of {@link MessageEntry} definitions.
 *
 * Each key becomes a factory returning a {@link LocalizedMessage} pre-filled with its
 * translations and the default locale.
 *
 * @param options - Default locale and message definitions.
 *
 * @returns An object whose keys mirror `definitions`, each a factory function.
 */
export const defineMessageCatalog = <const TDefs extends Record<string, MessageEntry>>(
	options: DefineMessageCatalogOptions<TDefs>
): MessageCatalog<TDefs> => {
	const catalog: Record<string, (params?: Record<string, string>) => LocalizedMessage> = {};

	for (const [key, msgDef] of Object.entries(options.definitions))
		catalog[key] = (params: Record<string, string> = {}): LocalizedMessage => ({
			translations: msgDef.translations,
			params,
			defaultLocale: options.defaultLocale as string
		});

	return catalog as MessageCatalog<TDefs>;
};
