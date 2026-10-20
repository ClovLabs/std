<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/elysia-openapi/logo-elysia-openapi.svg" alt="Clov Elysia OpenAPI logo" width="200" />
</p>

# Clov Elysia OpenAPI

An OpenAPI 3.2 document and a Scalar reference for your Elysia app, built from the schemas you already wrote on your routes.

The document is generated on the first request from `app.routes` and `app.models`, so routes registered after the plugin show up too. It covers `params`, `query`, `headers`, `cookie`, `body` and `response` from routes, guards and macros, and models end up in `components.schemas`.

Since it targets 3.2, `QUERY` routes, nested tags (`a/b` becomes `b` under `a`) and JSON Schema 2020-12 are described as they are. The OpenAPI 3.2 types (`OpenAPIObject`, `OperationObject`, `SchemaObject`, ...) are exported as well.

```bash
bun add @clov-std/elysia-openapi elysia typebox
```

`elysia` (v2) and `typebox` are peer dependencies.

## Usage

```ts
import { openapiPlugin } from '@clov-std/elysia-openapi';
import { Elysia, t } from 'elysia';

const app = new Elysia()
	.use(openapiPlugin({ document: { info: { title: 'My API', version: '1.0.0' } } }))
	.get(
		'/users/:id',
		{
			params: t.Object({ id: t.String() }),
			response: t.Object({ id: t.String() }),
			detail: { tags: ['users'], summary: 'Get a user' }
		},
		({ params }) => ({ id: params.id })
	)
	.listen(3000);
```

The reference is at `http://localhost:3000/openapi`, the JSON at `http://localhost:3000/openapi/json`. Both still work under a prefix.

Each operation gets an `operationId` derived from the method and path (`get` + `/users/:id` gives `getUsersById`), unique across the document.

### Response headers

```ts
import { withHeaders } from '@clov-std/elysia-openapi';

app.get(
	'/users',
	{ response: withHeaders(t.Array(t.String()), t.Object({ 'x-total-count': t.Integer() })) },
	() => []
);
```

This only documents the headers. Elysia doesn't validate response headers.

## API

### `openapiPlugin(options?)`

Returns a function to pass to `app.use`.

| Option     | Type                     | Default              | Description                                                                           |
| ---------- | ------------------------ | -------------------- | ------------------------------------------------------------------------------------- |
| `path`     | `string`                 | `'/openapi'`         | Path of the Scalar reference.                                                         |
| `specPath` | `string`                 | `` `${path}/json` `` | Path of the JSON document.                                                            |
| `scalar`   | `ScalarConfiguration`    | -                    | Scalar configuration, merged over the defaults.                                       |
| `document` | `Partial<OpenAPIObject>` | -                    | Document fields to merge, generated `paths` and `components.schemas` take precedence. |

### `withHeaders(schema, headers)`

Returns a copy of the response `schema` documented with the `headers` object schema.

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
