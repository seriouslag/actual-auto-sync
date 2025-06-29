# @seriouslag/actual-auto-sync

![Docker Image Version](https://img.shields.io/docker/v/seriouslag/actual-auto-sync?style=flat&label=Docker%20Image%20Version&link=https%3A%2F%2Fhub.docker.com%2Fr%2Fseriouslag%2Factual-auto-sync)


A background service that automatically runs bank sync on your Actual Budget accounts on a scheduled basis.

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

You can find you budget sync IDs in the Actual Budget app > _Selected Budget_ > Settings > Advanced Settings > Sync ID.

## Running with Docker (pull from docker hub)

```bash
docker run -d \
  -e ACTUAL_SERVER_URL="your-server-url" \
  -e ACTUAL_SERVER_PASSWORD="your-password" \
  -e CRON_SCHEDULE="0 1 * * *" \
  -e LOG_LEVEL="info" \
  -e ACTUAL_BUDGET_SYNC_IDS="1cf9fbf9-97b7-4647-8128-8afec1b1fbe2" \
  -e ENCRYPTION_PASSWORDS="password1" \
  seriouslag/actual-auto-sync:latest
```

## Development

### Prerequisites

- Node.js 22
- pnpm 10.8.1

### Setup non-docker

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env` file with your configuration:

   ```env
   ACTUAL_SERVER_URL=your-server-url
   ACTUAL_SERVER_PASSWORD=your-password
   CRON_SCHEDULE=0 1 * * *
   LOG_LEVEL=info
   ACTUAL_BUDGET_SYNC_IDS=1cf9fbf9-97b7-4647-8128-8afec1b1fbe2
   ENCRYPTION_PASSWORDS=your-encryption-password # or leave empty if you don't encrypt your data, the position of the password in the list is the position of the account in the ACTUAL_BUDGET_SYNC_IDS list; to skip an account add a comma to the list in that position
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
