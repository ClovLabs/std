import { HttpException, type HttpExceptionOptions } from '@clov-std/error';

import type { Translations } from '../type/translations';

/**
 * Options accepted by the {@link LocalizedHttpException} constructor.
 *
 * @template TCause - Type of the underlying cause.
 */
export interface LocalizedHttpExceptionOptions<
	TCause = unknown
> extends HttpExceptionOptions<TCause> {
	/** All available translations keyed by locale. */
	readonly translations: Translations;

	/** Parameter values to interpolate into `{{placeholder}}` tokens. */
	readonly params?: Readonly<Record<string, string>> | undefined;

	/** Locale used to build the default `message` string. */
	readonly defaultLocale: string;
}

/**
 * HTTP exception that carries translated messages.
 *
 * The `message` property contains the raw template for the default locale.
 * Use {@link resolveMessage} to get the interpolated string for any locale.
 *
 * @template TCause - Type of the underlying cause.
 */
export class LocalizedHttpException<const TCause = unknown> extends HttpException<TCause> {
	/** All available translations keyed by locale. */
	public readonly translations: Translations;

	/** Parameter values interpolated into `{{placeholder}}` tokens. */
	public readonly params: Readonly<Record<string, string>> | undefined;

	/** Locale used to build the default `message` string. */
	public readonly defaultLocale: string;

	/**
	 * Creates a new localized HTTP exception.
	 *
	 * @param key - Application-specific error key (e.g. `'dns.invalidRecordType'`).
	 * @param init - Translations, params, status, and cause.
	 */
	public constructor(key: string, init: LocalizedHttpExceptionOptions<TCause>) {
		super(init.translations[init.defaultLocale] ?? '', {
			cause: init.cause,
			status: init.status,
			key
		});
		this.translations = init.translations;
		this.params = init.params;
		this.defaultLocale = init.defaultLocale;
	}
}
