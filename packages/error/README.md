<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/error/logo-error.png" alt="Clov Error logo" width="200" />
</p>

# Clov Error

Errors with a stable `code`, so callers branch on what happened instead of matching `error.message`, which breaks the day someone rewords it.

Two classes:

- `Exception`: a `code` and a typed `cause`.
- `HttpException`: the same, plus a resolved HTTP `status`.

A low-level library throws `Exception` with `code: 'jwt.token.expired'` and knows nothing about HTTP or locales. The layer that does know maps the code to whatever the wire needs. No dependencies.

For translated messages, see [`@clov-std/i18n`](https://www.npmjs.com/package/@clov-std/i18n).

```bash
bun add @clov-std/error
```

## `Exception`

```ts
import { Exception } from '@clov-std/error';

throw new Exception('Configuration file not found', {
	code: 'config.file.not-found'
});
```

Callers switch on the `code`:

```ts
import { Exception } from '@clov-std/error';

try {
	await verifyToken(token);
} catch (err) {
	if (err instanceof Exception && err.code === 'jwt.token.expired') await refreshSession();
	else throw err;
}
```

Wrap the original error in `cause` to keep it around. Its type survives through the generic.

```ts
import { Exception } from '@clov-std/error';

try {
	await db.save(user);
} catch (err) {
	throw new Exception('Failed to persist user', { cause: err });
}
```

The constructor frame is stripped from the stack, and `name` is the actual subclass name.

### No request id, no timestamp

On purpose. Both belong to whoever handles the error: the request handler already has an `x-request-id`, and the log sink already stamps every line. Putting them on every exception means every throw pays for data nobody reads.

If your app really needs them on the instance, subclass:

```ts
class TracedException extends Exception {
	public readonly uuid: string = crypto.randomUUID();
	public readonly date: Date = new Date();
}
```

## `HttpException`

Takes a status name or number and resolves it to `error.status`:

```ts
import { HttpException } from '@clov-std/error';

throw new HttpException('Account not found', {
	code: 'auth.account.not-found',
	status: 'NOT_FOUND' // or 404
});
```

`status` is required. An HTTP exception without one is a bug, and defaulting to `500` would hide it.

There's nothing RFC 9457 in here, so the package still works from a CLI or a worker. Map `code` to a problem document at the boundary:

```ts
problem({ type: error.code, status: error.status, detail: error.message });
```

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
