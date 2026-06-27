# DWS Standard Library

The shared TypeScript toolkit behind **Dominus Web Services**.
Everything lives in this monorepo, is built with [Bun](https://bun.sh/), and published on npm under the `@dws-std/` scope.

## Packages

| Package                                                  | What it does                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`@dws-std/common`](packages/common)                     | Common utilities and types library for building robust applications.                                                    |
| [`@dws-std/elysia-ratelimit`](packages/elysia-ratelimit) | Elysia plugin for flexible, type-safe rate limiting with support for custom key generators and various backends.        |
| [`@dws-std/error`](packages/error)                       | Structured TypeScript exceptions with UUID v7 tracking, HTTP status codes, and automatic timestamps.                    |
| [`@dws-std/i18n`](packages/i18n)                         | Type-safe i18n for TypeScript — define localized exception and message catalogs with compile-time validated parameters. |
| [`@dws-std/jwt`](packages/jwt)                           | JWT utilities and helpers for secure token management.                                                                  |
| [`@dws-std/kv-store`](packages/kv-store)                 | Type-safe key-value store abstraction with support for multiple backends.                                               |
| [`@dws-std/logger`](packages/logger)                     | Type-safe logging library with support for structured logs and multiple output formats.                                 |
| [`@dws-std/registry`](packages/registry)                 | Centralized, type-safe registry for managing named instances.                                                           |
| [`@dws-std/totp`](packages/totp)                         | Time-based One-Time Password (TOTP) implementation in TypeScript.                                                       |

## Getting Started

```bash
bun install
```

## Scripts

| Command            | What it does                                |
| ------------------ | ------------------------------------------- |
| `bun run build`    | Build all packages                          |
| `bun run test`     | Run every test suite                        |
| `bun run lint`     | Lint all packages                           |
| `bun run lint:fix` | Lint and auto-fix                           |
| `bun run docs`     | Generate TypeDoc documentation              |
| `bun run clean`    | Wipe `node_modules`, `dist`, and lock files |

## Project Structure

```
packages/
├── common/              # @dws-std/common
├── elysia-ratelimit/    # @dws-std/elysia-ratelimit
├── error/               # @dws-std/error
├── i18n/                # @dws-std/i18n
├── jwt/                 # @dws-std/jwt
├── kv-store/            # @dws-std/kv-store
├── logger/              # @dws-std/logger
├── registry/            # @dws-std/registry
└── totp/                # @dws-std/totp
```

## Documentation

[https://dominus-web-service.github.io/std/](https://dominus-web-service.github.io/std/)

## License

MIT - [Dominus Web Services (DWS)](https://github.com/Dominus-Web-Service)
