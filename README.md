# Clov Standard Library

The shared TypeScript toolkit behind **Clov**.
Everything lives in this monorepo, is built with [Bun](https://bun.sh/), and published on npm under the `@clov-std/` scope.

## Packages

| Package                                                  | What it does                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`@clov-std/common`](packages/common)                     | Common utilities and types library for building robust applications.                                                    |
| [`@clov-std/elysia-ratelimit`](packages/elysia-ratelimit) | Elysia plugin for flexible, type-safe rate limiting with support for custom key generators and various backends.        |
| [`@clov-std/error`](packages/error)                       | Structured TypeScript exceptions with a machine-readable error key and a typed cause.                    |
| [`@clov-std/i18n`](packages/i18n)                         | Type-safe i18n for TypeScript — define localized exception and message catalogs with compile-time validated parameters. |
| [`@clov-std/jwt`](packages/jwt)                           | JWT utilities and helpers for secure token management.                                                                  |
| [`@clov-std/kv-store`](packages/kv-store)                 | Type-safe key-value store abstraction with support for multiple backends.                                               |
| [`@clov-std/logger`](packages/logger)                     | Type-safe logging library with support for structured logs and multiple output formats.                                 |
| [`@clov-std/registry`](packages/registry)                 | Centralized, type-safe registry for managing named instances.                                                           |
| [`@clov-std/totp`](packages/totp)                         | Time-based One-Time Password (TOTP) implementation in TypeScript.                                                       |

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
├── common/              # @clov-std/common
├── elysia-ratelimit/    # @clov-std/elysia-ratelimit
├── error/               # @clov-std/error
├── i18n/                # @clov-std/i18n
├── jwt/                 # @clov-std/jwt
├── kv-store/            # @clov-std/kv-store
├── logger/              # @clov-std/logger
├── registry/            # @clov-std/registry
└── totp/                # @clov-std/totp
```

## Documentation

[https://clovlabs.github.io/std/](https://clovlabs.github.io/std/)

## License

MIT - [Clov](https://github.com/ClovLabs)
