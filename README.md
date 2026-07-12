# @seriouslag/actual-auto-sync

[![Docker Image Version](https://img.shields.io/docker/v/seriouslag/actual-auto-sync?style=flat&label=Docker%20Image%20Version&link=https%3A%2F%2Fhub.docker.com%2Fr%2Fseriouslag%2Factual-auto-sync)](https://hub.docker.com/r/seriouslag/actual-auto-sync)
[![Code Coverage](https://codecov.io/github/seriouslag/actual-auto-sync/branch/main/graph/badge.svg?token=TPQPYMHI7S)](https://codecov.io/github/seriouslag/actual-auto-sync)
[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/seriouslag)

A background service that automatically runs the bank sync on a scheduled basis on Actual Budget.

It connects to your Actual Budget server with the official [`@actual-app/api`](https://www.npmjs.com/package/@actual-app/api), downloads your budgets, runs the bank sync, and pushes the changes back to the server — on whatever schedule you configure.

## Contents

- [Features](#features)
- [Configuration](#configuration)
  - [Environment variables](#environment-variables)
  - [Environment variables from files (Docker secrets)](#environment-variables-from-files-docker-secrets)
  - [If using with OIDC auth provider](#if-using-with-oidc-auth-provider-in-actual-budget-server)
- [Running with Docker (pull from Docker Hub)](#running-with-docker-pull-from-docker-hub)
- [Development](#development)
- [License](#license)
- [FAQ](#faq)

## Features

- Automatically runs bank sync on all your Actual Budget accounts on a configurable cron schedule
- Syncs **multiple budgets** in a single run
- Supports **end-to-end encrypted budgets** via per-budget encryption passwords
- Pushes updated account balances back to the server through CRDT writes
- **Self-healing retries**: on a failed budget sync it rebuilds the API session and clears stale local cache before retrying
- Optional per-account sync mode that skips failing accounts instead of aborting the whole budget
- Reads configuration from the environment or from files (Docker secrets) via the `_FILE` convention
- Ships as a Docker image that runs as a non-root user and supports a read-only root filesystem
- Configurable logging levels for monitoring and debugging
- Uses the official Actual Budget API for reliable synchronization

## Configuration

### Environment variables

| Variable                 | Required | Default                                            | Description                                                                                                                 |
| ------------------------ | -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ACTUAL_SERVER_URL`      | Yes      | —                                                  | URL of your Actual Budget server.                                                                                           |
| `ACTUAL_SERVER_PASSWORD` | Yes      | —                                                  | Password for your Actual Budget server.                                                                                     |
| `ACTUAL_BUDGET_SYNC_IDS` | Yes      | —                                                  | Comma-separated list of budget sync IDs to sync (e.g. `1cf9fbf9-...,030d7094-...`).                                         |
| `ENCRYPTION_PASSWORDS`   | No       | _(empty)_                                          | Comma-separated encryption passwords, positionally matched to `ACTUAL_BUDGET_SYNC_IDS`. See note below.                     |
| `CRON_SCHEDULE`          | No       | `0 1 * * *` (daily at 1am)                         | Cron expression for scheduling syncs.                                                                                       |
| `TIMEZONE`               | No       | `Etc/UTC` (`America/New_York` in the Docker image) | IANA time zone applied to `CRON_SCHEDULE` (e.g. `America/New_York`).                                                        |
| `LOG_LEVEL`              | No       | `info`                                             | One of `debug`, `info`, `warn`, `error`. At `warn`/`error` the verbose console output from `@actual-app/api` is suppressed. |
| `RUN_ON_START`           | No       | `false`                                            | Run a sync immediately on startup, in addition to the schedule. See note below.                                             |
| `SKIP_FAILED_ACCOUNTS`   | No       | `false`                                            | Sync each account individually and skip failing ones instead of aborting the budget. See note below.                        |
| `ACTUAL_DATA_DIR`        | No       | `./data` (`/data` in the Docker image)             | Directory where budget data and caches are written. Point at a mounted/tmpfs path to run with a read-only root filesystem.  |

You can find your budget sync IDs in the Actual Budget app > _Selected Budget_ > Settings > Advanced Settings > Sync ID.

Boolean variables (`RUN_ON_START`, `SKIP_FAILED_ACCOUNTS`) accept `true`/`false`, `1`/`0`, `yes`/`no`, or `on`/`off`.

**`ENCRYPTION_PASSWORDS`** — Leave empty if you don't encrypt your budgets. The position of each password matches the position of the budget in `ACTUAL_BUDGET_SYNC_IDS`. To skip a budget (no password), leave its slot empty by placing a comma in that position, e.g. `password1,,password3`.

**`RUN_ON_START`** — When set to `true` you may get a notice email from SimpleFIN (if you use that service), as they expect only one bank sync per day.

**`SKIP_FAILED_ACCOUNTS`** — When `false`, all accounts sync in a single request and any one failure aborts the budget's sync. When `true`, each account syncs individually and a failing account is logged and skipped so the rest still sync. Note: per-account syncing can result in more requests to your bank aggregator (e.g. SimpleFIN), which may matter for rate limits.

### Environment variables from files (Docker secrets)

You can set any environment variable from a file by using a special append `_FILE`.

As an example:

```bash
-e MYVAR_FILE=/run/secrets/mysecretvariable
```

Will set the environment variable `MYVAR` based on the contents of the `/run/secrets/mysecretvariable` file.

If both `MYVAR` and `MYVAR_FILE` are set, `MYVAR_FILE` takes precedence.

### If using with OIDC auth provider in Actual Budget Server

In your Actual Budget Server config, you must be able to log in with a password.

Set the following settings in your Actual Budget Server, then on initial login, you must set a password:

```yaml
services:
...
  actual_budget_server:
    image: actualbudget/actual-server:latest
    environment: ...
      - ACTUAL_OPENID_AUTH_METHOD=openid
      - ACTUAL_LOGIN_METHOD=openid
      - ACTUAL_ALLOWED_LOGIN_METHODS=openid,password,header
      - ACTUAL_OPENID_ENFORCE=false
      ...
  ...
```

## Running with Docker (pull from Docker Hub)

Images are published as multi-arch manifests for `linux/amd64` and `linux/arm64`, so `docker pull` / `docker run` automatically selects the right build for your host. The `linux/arm64` image requires a 64-bit ARM (ARM64/aarch64) operating system — for example Apple Silicon, an ARM-based NAS/server, or a Raspberry Pi 4/5 running a 64-bit OS. A 32-bit ARM OS (such as 32-bit Raspberry Pi OS) cannot use the `linux/arm64` image.

Published tags include:

- `latest` for the newest successful `main` build
- `vX.Y.Z.N` and `X.Y.Z.N` tags where `X.Y.Z` matches `@actual-app/api` (Actual Budget) and `N` is an internal release counter (for example: `26.2.0.1`, `26.2.0.2`)
- `<commit-sha>` tags for build traceability

### Publish a PR test image (maintainers)

For a pull request, maintainers can comment:

```text
/publish-test-image
```

The workflow will publish a test image with a tag like `seriouslag/actual-auto-sync:pr-<pr-number>-<sha8>` and reply on the PR with the full image name.

### direct docker run

```bash
docker run -d \
  -e ACTUAL_SERVER_URL="your-server-url" \
  -e ACTUAL_SERVER_PASSWORD="your-password" \
  -e CRON_SCHEDULE="0 1 * * *" \
  -e LOG_LEVEL="info" \
  -e ACTUAL_BUDGET_SYNC_IDS="1cf9fbf9-97b7-4647-8128-8afec1b1fbe2" \
  -e ENCRYPTION_PASSWORDS="password1" \
  -e TIMEZONE="Etc/UTC" \
  -e RUN_ON_START="false" \
  seriouslag/actual-auto-sync:latest
```

### Running with docker compose

```yaml
services:
...
  actual-auto-sync:
    image: seriouslag/actual-auto-sync:latest
    environment:
      - ACTUAL_SERVER_URL=your-server-url
      - ACTUAL_SERVER_PASSWORD=your-password
      - CRON_SCHEDULE=0 1 * * *
      - LOG_LEVEL=info
      - ACTUAL_BUDGET_SYNC_IDS=1cf9fbf9-97b7-4647-8128-8afec1b1fbe2
      - ENCRYPTION_PASSWORDS=password1
      - TIMEZONE=Etc/UTC
  ...
```

### Running with docker compose with docker secrets

```yaml
services:
...
  actual-auto-sync:
    image: seriouslag/actual-auto-sync:latest
    secrets:
      - actual_budget_sync_id
      - actual_server_password
      - encryption_passwords
    environment:
      - ACTUAL_SERVER_URL=your-server-url
      - ACTUAL_SERVER_PASSWORD_FILE=/run/secrets/actual_server_password
      - CRON_SCHEDULE=0 1 * * *
      - LOG_LEVEL=info
      - ACTUAL_BUDGET_SYNC_IDS_FILE=/run/secrets/actual_budget_sync_id
      - ENCRYPTION_PASSWORDS_FILE=/run/secrets/encryption_passwords
      - TIMEZONE=Etc/UTC
  ...

secrets:
  actual_budget_sync_id:
    file: actual_budget_sync_id.txt
  actual_server_password:
    file: actual_server_password.txt
  encryption_passwords:
    file: encryption_passwords.txt
```

Where files

- `actual_budget_sync_id.txt`
- `actual_server_password.txt`
- `encryption_passwords.txt`
  are plain text files next to your `docker-compose.yml` and containing your secrets

### Running as non-root with a read-only filesystem

The image runs as the unprivileged `node` user (uid/gid `1000`) by default. The only path the app needs to write is its data directory, which defaults to `ACTUAL_DATA_DIR=/data` in the image. Mount that as a writable volume (or tmpfs) and you can lock the rest of the container down with a read-only root filesystem:

```yaml
services:
  actual-auto-sync:
    image: seriouslag/actual-auto-sync:latest
    read_only: true
    volumes:
      - ./actual-auto-sync-data:/data
    environment:
      - ACTUAL_SERVER_URL=your-server-url
      - ACTUAL_SERVER_PASSWORD=your-password
      - ACTUAL_BUDGET_SYNC_IDS=1cf9fbf9-97b7-4647-8128-8afec1b1fbe2
```

The host-mounted directory must be writable by uid/gid `1000`. To match a different host user, build the image with custom ids:

```bash
docker build --build-arg APP_UID=1001 --build-arg APP_GID=1001 -t actual-auto-sync .
```

## Development

### Prerequisites

- Node.js >= 22 (CI and the Docker image use Node 24)
- pnpm >= 11 (the repo pins `pnpm@11.8.0`; run `corepack enable` to use the pinned version)

### Setup local (non-docker)

1. Install dependencies:

   ```bash
   # Clone the repository and `cd` into the folder
   pnpm install
   ```

2. Create a `.env` file with your configuration:

   ```env
   ACTUAL_SERVER_URL=your-server-url
   ACTUAL_SERVER_PASSWORD=your-password
   CRON_SCHEDULE=0 1 * * *
   LOG_LEVEL=info
   ACTUAL_BUDGET_SYNC_IDS=1cf9fbf9-97b7-4647-8128-8afec1b1fbe2
   ENCRYPTION_PASSWORDS=your-encryption-password # or leave empty if you don't encrypt your data, the position of the password in the list is the position of the account in the ACTUAL_BUDGET_SYNC_IDS list; to skip an account, add a comma to the list in that position
   ```

3. Start the service:
   ```bash
   pnpm start
   ```

### Scripts

```bash
pnpm start            # Run locally with the ts-node ESM loader
pnpm test             # Run unit tests (Vitest, watch mode)
pnpm test:coverage    # Run unit tests once with coverage
pnpm test:e2e         # Run e2e tests (needs an Actual server on localhost:5006)
pnpm test:e2e:docker  # Run e2e tests in Docker (spins up the server automatically)
pnpm build            # Type-check / compile with tsc
pnpm lint             # Lint with oxlint
pnpm format           # Format with oxfmt
pnpm check            # lint + format check + build
```

### Running with Docker (build locally)

```bash
docker build -t actual-auto-sync .
docker run -d \
  actual-auto-sync
```

## License

MIT

## FAQ

### Q: I am getting connection errors.

A: Double-check `ACTUAL_SERVER_PASSWORD`. For HTTPS connection errors, keep TLS verification enabled and fix certificate trust instead of disabling TLS checks globally.

```yaml
# example for a local/self-hosted certificate chain
services:
  ...
  actual-auto-sync:
    image: seriouslag/actual-auto-sync:latest
    restart: unless-stopped
    environment:
      - ACTUAL_SERVER_URL=https://<your-local-actual-budget-url>:<your-actual-budget-port>
      - ACTUAL_SERVER_PASSWORD=<your-actual-budget-password>
      - NODE_EXTRA_CA_CERTS=/path/to/ca.pem
      ...
  ...
```

If the above does not work, verify the server certificate chain and hostname on the Actual server, then restart the container with an updated CA bundle.
