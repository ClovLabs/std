import type { LocalizedHttpException } from './exception/localized-http-exception';
import type { LocalizedMessage } from './message/type/localized-message';

const interpolate = (template: string, params: Readonly<Record<string, string>>): string =>
	template.replace(
		/\{\{(\w+)\}\}/g,
		(_: string, key: string): string => params[key] ?? `{{${key}}}`
	);

/**
 * Turns a {@link LocalizedMessage} or {@link LocalizedHttpException} into
 * a plain string for the requested locale.
 *
 * `{{placeholder}}` tokens are replaced with matching values from `target.params`.
 * Falls back to `target.defaultLocale` when `locale` is omitted or has no
 * translation. Returns an empty string only when the default locale is missing too.
 *
 * @param target - Message or exception to resolve.
 * @param locale - Desired locale (e.g. `'fr'`). Defaults to `target.defaultLocale`.
 *
 * @returns Translated string with placeholders interpolated.
 */
export const resolveMessage = (
	target: LocalizedHttpException | LocalizedMessage,
	locale?: string
): string => {
	const template =
		target.translations[locale ?? target.defaultLocale] ??
		target.translations[target.defaultLocale] ??
		'';

	return target.params ? interpolate(template, target.params) : template;
};
