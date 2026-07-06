import type { CatalogFactory, ConsistentLocales, LocalesOf } from '#/type/translations';
import { LocalizedHttpException } from './localized-http-exception';
import type { ExceptionEntry } from './type/exception-entry';

export type ExceptionCatalog<TDefs extends Record<string, ExceptionEntry>> = {
	readonly [K in keyof TDefs]: CatalogFactory<TDefs[K]['translations'], LocalizedHttpException>;
};

/**
 * Configuration for {@link defineExceptionCatalog}.
 *
 * @template TDefs - Shape of the exception definitions map.
 */
export interface DefineExceptionCatalogOptions<TDefs extends Record<string, ExceptionEntry>> {
	/** Locale used to build the default `message` when no locale is specified. */
	readonly defaultLocale: LocalesOf<TDefs>;

	/** Map of exception definitions keyed by error name; every entry must cover the same locales. */
	readonly definitions: TDefs & ConsistentLocales<TDefs>;
}

/**
 * Builds a typed exception catalog from a set of {@link ExceptionEntry} definitions.
 *
 * Each key in `definitions` becomes a factory function that creates
 * a {@link LocalizedHttpException} pre-filled with the right translations,
 * HTTP status, and the definition key as error key.
 *
 * @param options - Default locale and exception definitions.
 *
 * @returns An object whose keys mirror `definitions`, each a factory function.
 */
export const defineExceptionCatalog = <const TDefs extends Record<string, ExceptionEntry>>(
	options: DefineExceptionCatalogOptions<TDefs>
): ExceptionCatalog<TDefs> => {
	const { defaultLocale, definitions } = options;
	const catalog: Record<string, (params?: Record<string, string>) => LocalizedHttpException> = {};

	for (const [key, exceptionDef] of Object.entries(definitions))
		catalog[key] = (params: Record<string, string> = {}): LocalizedHttpException =>
			new LocalizedHttpException(key, {
				status: exceptionDef.status,
				translations: exceptionDef.translations,
				params,
				defaultLocale: defaultLocale as string
			});

	return catalog as ExceptionCatalog<TDefs>;
};
