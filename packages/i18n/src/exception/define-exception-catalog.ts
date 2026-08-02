import type { HttpStatusCode, HttpStatusKey } from '../constant/http-status-codes';
import type { CatalogFactory, EntryMap, ExactEntries, LocalesOf } from '../type/translations';
import { LocalizedException } from './localized-exception';
import { LocalizedHttpException } from './localized-http-exception';
import type { ExceptionEntry } from './type/exception-entry';

/**
 * Result type of a single catalog entry: entries that declare a `status` build
 * a {@link LocalizedHttpException}, the others a plain {@link LocalizedException}.
 */
type ExceptionOf<TDef> = TDef extends ExceptionEntry ? LocalizedHttpException : LocalizedException;

export type ExceptionCatalog<TDefs extends EntryMap> = {
	readonly [K in keyof TDefs]: CatalogFactory<TDefs[K]['translations'], ExceptionOf<TDefs[K]>>;
};

/**
 * Configuration for {@link defineExceptionCatalog}.
 *
 * @template TDefs - Shape of the exception definitions map.
 */
export interface DefineExceptionCatalogOptions<TDefs extends EntryMap> {
	/** Locale used to build the default `message` when no locale is specified. */
	readonly defaultLocale: LocalesOf<TDefs>;

	/**
	 * Map of exception definitions keyed by error name. Every entry covers the same locales
	 * and carries nothing beyond an optional `status` and its `translations`.
	 */
	readonly definitions: TDefs &
		ExactEntries<
			TDefs,
			{
				readonly status?: HttpStatusKey | HttpStatusCode;
				readonly translations: Record<LocalesOf<TDefs>, string>;
			}
		>;
}

/**
 * Builds a typed exception catalog from a set of entry definitions.
 *
 * Each key becomes a factory returning a throwable exception pre-filled with its
 * translations and the definition key as error key: a {@link LocalizedHttpException}
 * when the entry declares a `status`, a plain {@link LocalizedException} otherwise.
 *
 * @param options - Default locale and exception definitions.
 *
 * @returns An object whose keys mirror `definitions`, each a factory function.
 */
export const defineExceptionCatalog = <const TDefs extends EntryMap>(
	options: DefineExceptionCatalogOptions<TDefs>
): ExceptionCatalog<TDefs> => {
	const { defaultLocale, definitions } = options;
	const catalog: Record<string, (params?: Record<string, string>) => LocalizedException> = {};

	for (const [key, exceptionDef] of Object.entries<EntryMap[string]>(definitions))
		catalog[key] = (params: Record<string, string> = {}): LocalizedException =>
			'status' in exceptionDef
				? new LocalizedHttpException(key, {
						status: (exceptionDef as ExceptionEntry).status,
						translations: exceptionDef.translations,
						params,
						defaultLocale: defaultLocale as string
					})
				: new LocalizedException(key, {
						translations: exceptionDef.translations,
						params,
						defaultLocale: defaultLocale as string
					});

	return catalog as ExceptionCatalog<TDefs>;
};
