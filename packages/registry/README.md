<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/ClovLabs/std@main/packages/registry/logo-registry.svg" alt="Clov Registry logo" width="200" />
</p>

# Clov Registry

A single place to register shared instances by name and get them back anywhere, instead of a `static instance` and a `getInstance()` on every class that needs one.

```bash
bun add @clov-std/registry @clov-std/error
```

`@clov-std/error` is a peer dependency.

## Registering

Do it once, at startup:

```ts
import { Registry } from '@clov-std/registry';

class DatabaseConnection {
	private isConnected: boolean = false;

	public constructor() {
		console.log('Database connection created');
		this.isConnected = true;
	}

	public query(sql: string): string[] {
		return ['result1', 'result2'];
	}
}

class ApiClient {
	public readonly baseUrl: string;
	private readonly apiKey: string;

	public constructor(baseUrl: string, apiKey: string) {
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
	}
}

Registry.register('DatabaseConnection', new DatabaseConnection());
Registry.register('ApiClient', new ApiClient('https://api.example.com', 'key'));
```

## Retrieving

You get the same reference every time. The type comes from the generic.

```ts
const db1 = Registry.get<DatabaseConnection>('DatabaseConnection');
const db2 = Registry.get<DatabaseConnection>('DatabaseConnection');

console.log(db1 === db2); // true, same reference

db1.query('SELECT * FROM users');
```

## Checking and replacing

```ts
if (Registry.has('ApiClient')) {
	const client = Registry.get<ApiClient>('ApiClient');
	console.log(client.baseUrl);
}

// To replace an instance, unregister it first.
Registry.unregister('DatabaseConnection');
Registry.register('DatabaseConnection', new DatabaseConnection());
```

## Docs

API reference: [clovlabs.github.io/std](https://clovlabs.github.io/std/)

## License

MIT, see [LICENSE.md](LICENSE.md).
