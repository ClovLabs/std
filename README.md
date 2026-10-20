# Clov Standard Library

The shared TypeScript toolkit behind **Clov**.
Everything lives in this monorepo, is built with [Bun](https://bun.sh/), and published on npm under the `@clov-std/` scope.

## Packages

| Package                                                   | What it does                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`@clov-std/common`](packages/common)                     | Small shared helpers: a human-readable duration parser, a typed EventEmitter and inline Bun workers. |
| [`@clov-std/elysia-cache`](packages/elysia-cache)         | Response caching for Elysia as a route macro, stored in any @clov-std/kv-store adapter.              |
| [`@clov-std/elysia-openapi`](packages/elysia-openapi)     | OpenAPI 3.2 document and Scalar reference for Elysia, generated from your route schemas.             |
| [`@clov-std/elysia-ratelimit`](packages/elysia-ratelimit) | Rate limiting for Elysia as a route macro, with RFC 9457 429 responses and pluggable storage.        |
| [`@clov-std/error`](packages/error)                       | Exceptions with a stable error code and a typed cause, plus an HttpException with a resolved status. |
| [`@clov-std/i18n`](packages/i18n)                         | Translation catalogs checked at compile time, for localized messages and throwable exceptions.       |
| [`@clov-std/jwt`](packages/jwt)                           | Sign and verify HS256 JWTs on top of jose, with the standard claims filled in.                       |
| [`@clov-std/kv-store`](packages/kv-store)                 | Key-value store with TTLs and counters, and in-memory and Bun Redis adapters behind one API.         |
| [`@clov-std/logger`](packages/logger)                     | Typed, sink-based logger for Bun that does its writing in a worker thread.                           |
| [`@clov-std/registry`](packages/registry)                 | Register shared instances by name and get them back anywhere, without a singleton per class.         |
| [`@clov-std/totp`](packages/totp)                         | Generate and verify HOTP and TOTP codes (RFC 4226 / 6238), with otpauth:// provisioning URIs.        |

## Getting Started

```bash
bun install
```

## Scripts

| Command               | What it does                                |
| --------------------- | ------------------------------------------- |
| `bun run build`       | Build all packages                          |
| `bun run test`        | Run every test suite                        |
| `bun run lint`        | Lint all packages                           |
| `bun run lint:fix`    | Lint and auto-fix                           |
| `bun run lint:github` | Lint with GitHub Actions output             |
| `bun run docs`        | Generate TypeDoc documentation              |
| `bun run clean`       | Wipe `node_modules`, `dist`, and lock files |

## Project Structure

```
packages/
├── common/              # @clov-std/common
├── elysia-cache/        # @clov-std/elysia-cache
├── elysia-openapi/      # @clov-std/elysia-openapi
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
