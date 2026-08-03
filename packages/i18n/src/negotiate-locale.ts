/**
 * Picks the best supported locale for an `Accept-Language` header.
 *
 * @template TLocale - Locales the application serves.
 */
export type LocaleNegotiator<TLocale extends string> = (header?: string) => TLocale;

/**
 * Configuration for {@link defineLocaleNegotiator}.
 *
 * @template TLocale - Locales the application serves.
 */
export interface DefineLocaleNegotiatorOptions<TLocale extends string> {
	/** Lowercase tags matching your catalog keys (`'en'`, `'pt-br'`). Order is irrelevant. */
	readonly supported: readonly TLocale[];
	/** Locale returned when the client accepts none of the supported ones. */
	readonly fallback: TLocale;
}

/** Weight of a language range, `1` when no readable `q=` is attached. */
const qualityOf = (range: string): number => Number(/;\s*q=([\d.]+)/.exec(range)?.[1] ?? 1);

/** Language tag of a range, without its quality value or surrounding spaces. */
const tagOf = (range: string): string => range.split(';')[0]?.trim() ?? '';

/**
 * Builds a locale negotiator for a fixed set of supported locales.
 *
 * Ranks the header's ranges by quality value and returns the first supported locale, trying
 * each range whole (`pt-br`) before its language subtag (`pt`); `q=0` refuses a locale.
 * Needed because a raw header like `fr-CA,fr;q=0.9,en;q=0.8` matches no catalog key and
 * would make {@link resolveMessage} fall back to the default locale.
 *
 * @param options - Supported locales and the fallback to use when none match.
 *
 * @returns A negotiator narrowed to the supported locales.
 */
export const defineLocaleNegotiator = <const TLocale extends string>({
	supported,
	fallback
}: DefineLocaleNegotiatorOptions<TLocale>): LocaleNegotiator<TLocale> => {
	const isSupported = (locale: string): locale is TLocale =>
		supported.includes(locale as TLocale);

	return (header?: string): TLocale =>
		(header ?? '')
			.toLowerCase()
			.split(',')
			.map((range) => ({ tag: tagOf(range), quality: qualityOf(range) }))
			.filter(({ quality }) => quality > 0)
			.sort((a, b) => b.quality - a.quality)
			.flatMap(({ tag }) => [tag, tag.split('-')[0] ?? ''])
			.find(isSupported) ?? fallback;
};
