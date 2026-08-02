/** A locale-to-text mapping (e.g. `{ en: 'Hello', fr: 'Bonjour' }`). */
export type Translations = Readonly<Record<string, string>>;

/**
 * Names of the `{{placeholder}}` tokens inside a template string.
 *
 * Matches more loosely than the runtime regex (`{{\w+}}`): `{{ x }}` is captured here
 * but left untouched at runtime, so keep placeholders to plain identifiers.
 */
type PlaceholderNames<TTemplate extends string> =
	TTemplate extends `${string}{{${infer Name}}}${infer Rest}`
		? Name | PlaceholderNames<Rest>
		: never;

/**
 * Required interpolation params derived from every template in a translations map.
 *
 * Each distinct `{{placeholder}}` across all locales becomes a required `string`
 * key. A map with no placeholders yields `{}` (no params needed).
 */
export type ParamsOf<TTranslations extends Translations> = Record<
	PlaceholderNames<TTranslations[keyof TTranslations]>,
	string
>;

/**
 * Factory signature for a catalog entry: `() => TResult` when its templates have
 * no placeholders, otherwise `(params) => TResult` with params derived from them.
 */
export type CatalogFactory<TTranslations extends Translations, TResult> = [
	keyof ParamsOf<TTranslations>
] extends [never]
	? () => TResult
	: (params: ParamsOf<TTranslations>) => TResult;

/** A map of catalog entries keyed by name, each carrying its own translations. */
export type EntryMap = Record<string, { readonly translations: Translations }>;

/** Union of every locale key used across all entries of a catalog. */
export type LocalesOf<TDefs extends EntryMap> = {
	[K in keyof TDefs]: keyof TDefs[K]['translations'];
}[keyof TDefs];

/**
 * Contextual shape for every entry of a catalog, intersected with `TDefs` on the
 * `definitions` option: it pins `translations` to the catalog-wide locale set, drives
 * autocompletion, and maps any key outside `TShape` to `never`.
 *
 * That `never` is the only way to reject a stray key: `TDefs` is inferred from the
 * literal, so TypeScript's excess property check never fires on it.
 */
export type ExactEntries<TDefs extends EntryMap, TShape> = {
	[K in keyof TDefs]: TShape & Record<Exclude<keyof TDefs[K], keyof TShape>, never>;
};
