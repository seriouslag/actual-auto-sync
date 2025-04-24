# @seriouslag/actual-auto-sync

A background service that automatically syncs your Actual Budget accounts on a scheduled basis.

## Features

- Automatically syncs all your Actual Budget accounts on a configurable schedule
- Uses the official Actual Budget API for reliable synchronization
- Configurable logging levels for monitoring and debugging
- Runs in a Docker container for easy deployment

## Configuration

The service requires the following environment variables:

- `ACTUAL_DATA_DIR`: Directory where Actual Budget stores its data (default: `./data`) best to be a local directory, no need to be mounted as a volume if using docker
- `ACTUAL_SERVER_URL`: URL of your Actual Budget server
- `ACTUAL_SERVER_PASSWORD`: Password for your Actual Budget server
- `CRON_SCHEDULE`: Cron expression for scheduling syncs (default: `0 1 * * *` - daily at 1am)
- `LOG_LEVEL`: Logging level (default: `info`)
- `ACTUAL_BUDGET_SYNC_IDS`: Comma-separated list of budget IDs to sync (e.g. "1cf9fbf9-97b7-4647-8128-8afec1b1fbe2,030d7094-aae8-4d70-aeee-9e29d30d9b88")
- `ENABLE_HISTORY`: Enable history tracking (default: `false`)

You can find you budget sync IDs in the Actual Budget app > _Selected Budget_ > Settings > Advanced Settings > Sync ID.

## Running with Docker

```bash
docker run -d \
  -e ACTUAL_DATA_DIR=./data \
  -e ACTUAL_SERVER_URL="your-server-url" \
  -e ACTUAL_SERVER_PASSWORD="your-password" \
  -e CRON_SCHEDULE="0 1 * * *" \
  -e LOG_LEVEL="info" \
  -e ACTUAL_BUDGET_SYNC_IDS="1cf9fbf9-97b7-4647-8128-8afec1b1fbe2" \
  -e ENABLE_HISTORY="true" \
  seriouslag/actual-auto-sync
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
   ACTUAL_DATA_DIR=./data
   ACTUAL_SERVER_URL=your-server-url
   ACTUAL_SERVER_PASSWORD=your-password
   CRON_SCHEDULE=0 1 * * *
   LOG_LEVEL=info
   ACTUAL_BUDGET_SYNC_IDS=1cf9fbf9-97b7-4647-8128-8afec1b1fbe2
   ENABLE_HISTORY=true
   ```

3. Start the service:
   ```bash
   pnpm start
   ```

### Running with Docker

```bash
docker build -t actual-auto-sync .
docker run -d \
  -e ACTUAL_DATA_DIR=./data \
  -e ACTUAL_SERVER_URL="your-server-url" \
  -e ACTUAL_SERVER_PASSWORD="your-password" \
  -e CRON_SCHEDULE="0 1 * * *" \
  -e LOG_LEVEL="info" \
  -e ACTUAL_BUDGET_SYNC_IDS="1cf9fbf9-97b7-4647-8128-8afec1b1fbe2" \
  -e ENABLE_HISTORY="true" \
  actual-auto-sync
```

## License

MIT
