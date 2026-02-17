# @seriouslag/actual-auto-sync

[![Docker Image Version](https://img.shields.io/docker/v/seriouslag/actual-auto-sync?style=flat&label=Docker%20Image%20Version&link=https%3A%2F%2Fhub.docker.com%2Fr%2Fseriouslag%2Factual-auto-sync)](https://hub.docker.com/r/seriouslag/actual-auto-sync)
[![Code Coverage](https://codecov.io/github/seriouslag/actual-auto-sync/branch/main/graph/badge.svg?token=TPQPYMHI7S)](https://codecov.io/github/seriouslag/actual-auto-sync)
[![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/seriouslag)

A background service that automatically runs the bank sync on a scheduled basis on Actual Budget.

## Features

- Automatically runs bank sync on all your Actual Budget accounts on a configurable schedule
- Uses the official Actual Budget API for reliable synchronization
- Configurable logging levels for monitoring and debugging
- Runs in a Docker container for easy deployment

## Configuration

The service requires the following environment variables:

- `ACTUAL_SERVER_URL`: URL of your Actual Budget server
- `ACTUAL_SERVER_PASSWORD`: Password for your Actual Budget server
- `CRON_SCHEDULE`: Cron expression for scheduling syncs (default: `0 1 * * *` - daily at 1am)
- `LOG_LEVEL`: Logging level (default: `info`)
- `ACTUAL_BUDGET_SYNC_IDS`: Comma-separated list of budget IDs to sync (e.g. "1cf9fbf9-97b7-4647-8128-8afec1b1fbe2,030d7094-aae8-4d70-aeee-9e29d30d9b88")
- `ENCRYPTION_PASSWORDS`: Comma-separated list of encryption passwords for each account in the ACTUAL_BUDGET_SYNC_IDS list (e.g. "password1,password2") or leave empty if you don't encrypt your data, the position of the password in the list is the position of the account in the ACTUAL_BUDGET_SYNC_IDS list; to skip an account add a comma to the list in that position
- `TIMEZONE`: Timezone for the cron job (default: `Etc/UTC`)
- `RUN_ON_START`: Whether to run the sync on startup (default: `false`) - Please note that when setting this to `true`, you may get a notice email from SimpleFin (if you use that service), as they expect only a bank sync once a day.

You can find your budget sync IDs in the Actual Budget app > _Selected Budget_ > Settings > Advanced Settings > Sync ID.

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

## Running with Docker (pull from docker hub)

Published tags include:

- `latest` for the newest successful `main` build
- `vX.Y.Z.N` and `X.Y.Z.N` tags where `X.Y.Z` matches `@actual-app/api` (Actual Budget) and `N` is an internal release counter (for example: `26.2.0.1`, `26.2.0.2`)
- `<commit-sha>` tags for build traceability

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

## Development

### Prerequisites

- Node.js >= 22
- pnpm >= 10.8.1

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
