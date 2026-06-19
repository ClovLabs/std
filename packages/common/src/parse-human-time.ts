import { Exception } from '@dws-std/error';

export const PARSE_HUMAN_TIME_ERROR_KEYS = {
	INVALID_TIME_EXPRESSION: 'common.parse-human-time.invalid-time-expression'
} as const;

export type TimeUnit =
	| 'ms'
	| 'milliseconds'
	| 'seconds'
	| 'minutes'
	| 'hours'
	| 'days'
	| 'weeks'
	| 'years';

/**
 * Time unit constants in seconds
 */
const TIME_UNITS = {
	SECOND: 1,
	MINUTE: 60,
	HOUR: 60 * 60,
	DAY: 60 * 60 * 24,
	WEEK: 60 * 60 * 24 * 7,
	YEAR: 60 * 60 * 24 * 365.25
} as const;

/**
 * Regular expression to parse human-readable time expressions
 * Matches patterns like: "2 hours", "+30 minutes", "1 day ago", "5 seconds from now"
 */
const TIME_EXPRESSION_REGEX =
	/^(\+|-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;

/**
 * Mapping of unit strings to their corresponding time unit values
 */
const UNIT_MAPPINGS: Record<string, number> = {
	// Seconds
	s: TIME_UNITS.SECOND,
	sec: TIME_UNITS.SECOND,
	secs: TIME_UNITS.SECOND,
	second: TIME_UNITS.SECOND,
	seconds: TIME_UNITS.SECOND,

	// Minutes
	m: TIME_UNITS.MINUTE,
	min: TIME_UNITS.MINUTE,
	mins: TIME_UNITS.MINUTE,
	minute: TIME_UNITS.MINUTE,
	minutes: TIME_UNITS.MINUTE,

	// Hours
	h: TIME_UNITS.HOUR,
	hr: TIME_UNITS.HOUR,
	hrs: TIME_UNITS.HOUR,
	hour: TIME_UNITS.HOUR,
	hours: TIME_UNITS.HOUR,

	// Days
	d: TIME_UNITS.DAY,
	day: TIME_UNITS.DAY,
	days: TIME_UNITS.DAY,

	// Weeks
	w: TIME_UNITS.WEEK,
	week: TIME_UNITS.WEEK,
	weeks: TIME_UNITS.WEEK,

	// Years
	y: TIME_UNITS.YEAR,
	yr: TIME_UNITS.YEAR,
	yrs: TIME_UNITS.YEAR,
	year: TIME_UNITS.YEAR,
	years: TIME_UNITS.YEAR
};

/**
 * Conversion factors from seconds to each supported unit
 */
const CONVERSION_FACTORS: Record<TimeUnit, number> = {
	ms: 0.001,
	milliseconds: 0.001,
	seconds: 1,
	minutes: 60,
	hours: 60 * 60,
	days: 60 * 60 * 24,
	weeks: 60 * 60 * 24 * 7,
	years: 60 * 60 * 24 * 365.25
};

/**
 * Converts a human-readable time expression to a numeric value in the specified unit
 *
 * @param timeExpression - A string representing a time period (e.g., "2 hours", "30 minutes ago", "+1 day")
 * @param unit - The unit to return the result in (default: "seconds")
 *
 * @throws ({@link Exception}) - If the time expression is invalid or contains an unknown unit
 *
 * @returns The time period in the requested unit (negative for past times)
 *
 * @example
 * ```typescript
 * parseHumanTime("2 hours")           // Returns 7200 (seconds)
 * parseHumanTime("30 mins ago")       // Returns -1800 (seconds)
 * parseHumanTime("+1 day", "hours")  // Returns 24
 * parseHumanTime("1 hour", "ms")      // Returns 3600000
 * ```
 */
export const parseHumanTime = (timeExpression: string, unit: TimeUnit = 'seconds'): number => {
	const match = TIME_EXPRESSION_REGEX.exec(timeExpression);

	if (!match || (match[4] && match[1]))
		throw new Exception(`Invalid time expression: ${timeExpression}`, {
			key: PARSE_HUMAN_TIME_ERROR_KEYS.INVALID_TIME_EXPRESSION,
			cause: { timeExpression }
		});

	const [, sign, valueStr, unitStr, direction] = match;

	if (!valueStr || !unitStr)
		throw new Exception(`Invalid time expression: ${timeExpression}`, {
			key: PARSE_HUMAN_TIME_ERROR_KEYS.INVALID_TIME_EXPRESSION,
			cause: { timeExpression }
		});

	const value = parseFloat(valueStr);
	const rawUnit = unitStr.toLowerCase();

	const multiplier = UNIT_MAPPINGS[rawUnit];
	if (!multiplier)
		throw new Exception(`Invalid time expression: ${timeExpression}`, {
			key: PARSE_HUMAN_TIME_ERROR_KEYS.INVALID_TIME_EXPRESSION,
			cause: { timeExpression, rawUnit }
		});

	const seconds = Math.round(value * multiplier);

	const conversion = CONVERSION_FACTORS[unit];
	const result = seconds / conversion;

	// Return negative value for past times (ago or negative sign)
	if (sign === '-' || direction === 'ago') return -result;

	return result;
};
