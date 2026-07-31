import type { LocalizedException } from './exception/localized-exception';
import type { LocalizedMessage } from './message/type/localized-message';

const interpolate = (template: string, params: Readonly<Record<string, string>>): string =>
	template.replace(
		/\{\{(\w+)\}\}/g,
		(_: string, key: string): string => params[key] ?? `{{${key}}}`
	);

/**
 * Turns a {@link LocalizedMessage} or {@link LocalizedException} into a plain string for
 * the requested locale, replacing `{{placeholder}}` tokens with values from `target.params`.
 *
 * Falls back to `target.defaultLocale`, then to an empty string.
 *
 * @param target - Message or exception to resolve.
 * @param locale - Desired locale (e.g. `'fr'`). Defaults to `target.defaultLocale`.
 *
 * @returns Translated string with placeholders interpolated.
 */
export const resolveMessage = (
	target: LocalizedException | LocalizedMessage,
	locale?: string
): string => {
	const template =
		target.translations[locale ?? target.defaultLocale] ??
		target.translations[target.defaultLocale] ??
		'';

	return target.params ? interpolate(template, target.params) : template;
};
