# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A background service that automatically runs bank sync on Actual Budget accounts on a configurable schedule. It uses the official `@actual-app/api` to connect to an Actual Budget server, download budgets, run bank syncs, and sync changes back to the server.

## Plan

- Make plans as concise as possible. Sacrifice grammar to be concise.
- At the end of every plan provide a list of unresolved questions to be answered.

## Commands

```bash
# Install dependencies
pnpm install

# Run locally (uses ts-node with ESM loader)
pnpm start

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run a single test file
pnpm test src/__tests__/utils.test.ts

# Run e2e tests (requires Actual Budget server running on localhost:5006)
pnpm test:e2e

# Run e2e tests with Docker (spins up server automatically)
pnpm test:e2e:docker

# Type check
pnpm build

# Build Docker image locally
docker build -t actual-auto-sync .
```

## Architecture

```
src/
├── index.ts       # Entry point - sets up global error handlers, creates and starts cron job
├── env.ts         # Environment configuration with Zod validation schemas
├── cron.ts        # Cron job creation and lifecycle (onTick, onComplete)
├── logger.ts      # Pino logger instance configured from env
├── utils.ts       # Core sync logic - init, download budgets, run bank sync
└── __tests__/
    ├── *.test.ts  # Unit tests with vi.mock for external dependencies
    └── e2e/       # E2E tests against real Actual Budget server
        ├── setup.ts           # Test utilities (waitForServer, initApi, etc.)
        └── sync.e2e.test.ts   # Main e2e test suite
```

### Key Flow

1. `index.ts` creates a cron job via `createCronJob()`
2. On each tick (or on start if `RUN_ON_START=true`), `sync()` is called
3. `sync()` initializes the Actual API, downloads configured budgets, runs `runBankSync()`, then syncs back to server
4. The service handles unhandled rejections gracefully (required because `@actual-app/api` may throw these)

### Environment Configuration

Environment variables are validated at startup using `@t3-oss/env-core` with Zod schemas. Key schemas in `env.ts`:

- `budgetIdSchema` - comma-separated list transformed to array
- `encryptionPasswordSchema` - comma-separated passwords, positionally matched to budget IDs
- `runOnStartSchema` - flexible boolean parsing (accepts "true", "1", "yes", "on", etc.)
- `timezoneSchema` - validates against IANA timezone database using Luxon

### Testing Patterns

**Unit tests** use Vitest with:

- `vi.mock()` for external dependencies (`@actual-app/api`, `node:fs/promises`)
- Mock env object to avoid loading real environment during tests
- Tests for both success paths and error handling

**E2E tests** (`src/__tests__/e2e/`) run against a real Actual Budget server:

- `docker-compose.e2e.yml` spins up an `actualbudget/actual-server` container and a mock SimpleFIN server
- Tests create fresh budgets/accounts/transactions programmatically via `@actual-app/api`
- `runBankSync()` is called on unlinked accounts (completes without fetching transactions)
- The mock SimpleFIN server provides test fixtures for bank sync integration testing
- Use `pnpm test:e2e:docker` for the full Docker-based test flow

## ESM Configuration

This project uses ES modules. Important:

- All imports use `.js` extension (e.g., `import { logger } from "./logger.js"`)
- Uses `ts-node/esm` loader for development: `node --loader ts-node/esm`
- Built files go to `dist/` and are run with plain `node dist/src/index.js` in Docker
