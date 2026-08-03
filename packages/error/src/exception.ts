/**
 * Options accepted by the {@link Exception} constructor.
 *
 * @template TCause - Type of the underlying cause, kept as-is for debugging.
 */
export interface ExceptionOptions<TCause = unknown> {
	/** Application-specific error code (e.g. `'jwt.token.expired'`). */
	readonly code?: string | undefined;

	/** Original error or contextual value that triggered this exception. */
	readonly cause?: TCause | undefined;
}

/**
 * Base exception that extends the native `Error` with a machine-readable `code` and a
 * typed `cause`.
 *
 * Carries no request id and no timestamp: those belong to whatever handles the error.
 * Subclass this if an application needs them on the instance.
 *
 * @template TCause - Type of the underlying cause.
 */
export class Exception<const TCause = unknown> extends Error {
	/** Original error or value that triggered this exception. */
	public override readonly cause: TCause | undefined;

	/** Application-specific error code (e.g. `'jwt.token.expired'`). */
	public readonly code: string | undefined;

	/**
	 * Creates a new exception.
	 *
	 * @param message - Human-readable description of what went wrong.
	 * @param init - Optional code and cause.
	 */
	public constructor(message: string, init?: ExceptionOptions<TCause>) {
		super(message, { cause: init?.cause });
		this.cause = init?.cause;
		this.code = init?.code;
		this.name = new.target.name;
		Error.captureStackTrace(this, new.target);
	}
}
