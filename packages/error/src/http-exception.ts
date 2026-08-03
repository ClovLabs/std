import {
	HTTP_STATUS_CODES,
	type HttpStatusCode,
	type HttpStatusKey
} from './constant/http-status-codes';
import { Exception, type ExceptionOptions } from './exception';

/**
 * Options accepted by the {@link HttpException} constructor.
 *
 * @template TCause - Type of the underlying cause.
 */
export interface HttpExceptionOptions<TCause = unknown> extends ExceptionOptions<TCause> {
	/**
	 * HTTP status for this exception.
	 *
	 * Accepts a key name (`'NOT_FOUND'`) or a numeric code (`404`). Required: an HTTP
	 * exception without an explicit status is a bug, and a silent default would hide it.
	 */
	readonly status: HttpStatusKey | HttpStatusCode;
}

/**
 * Exception bound to an HTTP status code.
 *
 * Extends {@link Exception} with a resolved numeric `status`, so an error handler can answer
 * with the right status without a second lookup.
 *
 * @template TCause - Type of the underlying cause.
 */
export class HttpException<const TCause = unknown> extends Exception<TCause> {
	/** Resolved numeric HTTP status code (e.g. `404`). */
	public readonly status: number;

	/**
	 * Creates a new HTTP exception.
	 *
	 * @param message - Human-readable description of what went wrong.
	 * @param init - Status, plus an optional code and cause.
	 */
	public constructor(message: string, init: HttpExceptionOptions<TCause>) {
		super(message, init);
		this.status =
			typeof init.status === 'number' ? init.status : HTTP_STATUS_CODES[init.status];
	}
}
