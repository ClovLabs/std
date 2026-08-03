import { Exception, type ExceptionOptions } from '@clov-std/error';

import type { Translations } from '../type/translations';

/**
 * Options accepted by the {@link LocalizedException} constructor.
 *
 * `key` is omitted: it comes from the first positional argument, and accepting it twice
 * would silently ignore one of the two.
 *
 * @template TCause - Type of the underlying cause.
 */
export interface LocalizedExceptionOptions<TCause = unknown> extends Omit<
	ExceptionOptions<TCause>,
	'key'
> {
	/** All available translations keyed by locale. */
	readonly translations: Translations;

	/** Parameter values to interpolate into `{{placeholder}}` tokens. */
	readonly params?: Readonly<Record<string, string>> | undefined;

	/** Locale used to build the default `message` string. */
	readonly defaultLocale: string;
}

/**
 * Exception carrying translated messages, for applications with no HTTP layer (workers,
 * CLIs, queue consumers). For an API, use {@link LocalizedHttpException} instead.
 *
 * `message` holds the raw template for the default locale; {@link resolveMessage}
 * interpolates it for any locale.
 *
 * @template TCause - Type of the underlying cause.
 */
export class LocalizedException<const TCause = unknown> extends Exception<TCause> {
	/** All available translations keyed by locale. */
	public readonly translations: Translations;

	/** Parameter values interpolated into `{{placeholder}}` tokens. */
	public readonly params: Readonly<Record<string, string>> | undefined;

	/** Locale used to build the default `message` string. */
	public readonly defaultLocale: string;

	/**
	 * Creates a new localized exception.
	 *
	 * @param code - Application-specific error code (e.g. `'queue.job.cancelled'`).
	 * @param init - Translations, params, default locale, and cause.
	 */
	public constructor(code: string, init: LocalizedExceptionOptions<TCause>) {
		super(init.translations[init.defaultLocale] ?? '', {
			cause: init.cause,
			code
		});
		this.translations = init.translations;
		this.params = init.params;
		this.defaultLocale = init.defaultLocale;
	}
}
