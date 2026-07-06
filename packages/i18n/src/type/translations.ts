/** A locale-to-text mapping (e.g. `{ en: 'Hello', fr: 'Bonjour' }`). */
export type Translations = Readonly<Record<string, string>>;

/**
 * Names of `{{placeholder}}` tokens inside a template string.
 *
 * ponytail: loosely mirrors the runtime interpolation regex (`{{\w+}}`) - it also
 * captures names with spaces/dots (e.g. `{{ x }}`), which the regex would leave
 * untouched. Real placeholders are identifiers, so don't put spaces in `{{...}}`.
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
 * Forces every entry to cover the full {@link LocalesOf} union - intersect it with
 * `TDefs` on the `definitions` option so a locale present on any entry is required
 * on all of them (catches a translation forgotten on a single entry at compile time).
 */
export type ConsistentLocales<TDefs extends EntryMap> = {
	[K in keyof TDefs]: { readonly translations: Record<LocalesOf<TDefs>, string> };
};
