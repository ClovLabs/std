import {
	HTTP_STATUS_CODES,
	type HttpStatusCode,
	type HttpStatusKey
} from '../constant/http-status-codes';
import { LocalizedException, type LocalizedExceptionOptions } from './localized-exception';

/**
 * Options accepted by the {@link LocalizedHttpException} constructor.
 *
 * @template TCause - Type of the underlying cause.
 */
export interface LocalizedHttpExceptionOptions<
	TCause = unknown
> extends LocalizedExceptionOptions<TCause> {
	/**
	 * HTTP status for this exception.
	 *
	 * Accepts a key name (`'NOT_FOUND'`) or a numeric code (`404`).
	 */
	readonly status: HttpStatusKey | HttpStatusCode;
}

/**
 * Localized exception bound to an HTTP status code.
 *
 * Adds a resolved `httpStatusCode` to {@link LocalizedException}, so an API error handler
 * answers with the right status without a second lookup.
 *
 * @template TCause - Type of the underlying cause.
 */
export class LocalizedHttpException<const TCause = unknown> extends LocalizedException<TCause> {
	/** Resolved numeric HTTP status code (e.g. `404`). */
	public readonly httpStatusCode: number;

	/**
	 * Creates a new localized HTTP exception.
	 *
	 * @param key - Application-specific error key (e.g. `'dns.invalidRecordType'`).
	 * @param init - Status, translations, params, and cause.
	 */
	public constructor(key: string, init: LocalizedHttpExceptionOptions<TCause>) {
		super(key, init);
		this.httpStatusCode =
			typeof init.status === 'number' ? init.status : HTTP_STATUS_CODES[init.status];
	}
}
