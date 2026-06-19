# 🎯 DWS Registry

If you've ever copy-pasted a `getInstance()` pattern into yet another class, this package is for you.
It gives you a single, centralized registry to store and retrieve instances — type-safe, predictable, and easy to test.

## Why this package?

The classic singleton pattern works, but it scatters `static instance` fields across your codebase.
Every class re-implements the same boilerplate. With `Registry`, you register instances once and retrieve them anywhere by name.
One registry, no duplication.

## 📌 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [License](#-license)
- [Contact](#-contact)

## ✨ Features

- 🔒 **Type-safe** — Full generics support, no `any` casting required.
- 🎯 **Centralized** — One place to manage all your instances.
- ⚡ **Lightweight** — Minimal overhead, does exactly what it says.

## 🔧 Installation

```bash
bun add @dws-std/registry
```

> **Peer dependency:** `@dws-std/error` must be installed alongside.

## ⚙️ Usage

### Registering instances

Register your instances once at startup. They're available everywhere after that.

```ts
import { Registry } from '@dws-std/registry';

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
	public constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string
	) {}

	public get baseUrl(): string {
		return this.baseUrl;
	}
}

Registry.register('DatabaseConnection', new DatabaseConnection());
Registry.register('ApiClient', new ApiClient('https://api.example.com', 'key'));
```

### Retrieving instances

Same instance, every time. You specify the type via the generic, and TypeScript takes care of the rest.

```ts
const db1 = Registry.get<DatabaseConnection>('DatabaseConnection');
const db2 = Registry.get<DatabaseConnection>('DatabaseConnection');

console.log(db1 === db2); // true — same reference

db1.query('SELECT * FROM users'); // type-safe
```

### Checking & swapping

```ts
if (Registry.has('ApiClient')) {
	const client = Registry.get<ApiClient>('ApiClient');
	console.log(client.baseUrl);
}

// Need to replace an instance? Unregister first, then register the new one.
Registry.unregister('DatabaseConnection');
Registry.register('DatabaseConnection', new DatabaseConnection());
```

## 📚 API Reference

Full docs: [Dominus-Web-Service.github.io/packages](https://Dominus-Web-Service.github.io/packages/)

## ⚖️ License

MIT — Feel free to use it.

## 📧 Contact

- GitHub: [Dominus-Web-Service](https://github.com/Dominus-Web-Service/packages)
