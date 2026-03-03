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
- `ENFORCE_READ_ONLY`: Optional hard-fail toggle for writable container root filesystems. Set `true` to enforce now (default: `false` for compatibility).
- `RUNNING_IN_CONTAINER`: Optional container-detection override for uncommon runtimes. Set `true` to force container security checks when auto-detection misses (default: `false`).
- `ACTUAL_DATA_DIR`: Deprecated legacy data directory override. Kept for compatibility only and planned for removal in the next major release.

Container data defaults to `/data` inside the container.

You can find your budget sync IDs in the Actual Budget app > _Selected Budget_ > Settings > Advanced Settings > Sync ID.

### Deprecations

- `ACTUAL_DATA_DIR` is deprecated and will be removed in the next major release. Use `/data` in containers and mount `/data` with tmpfs or a volume.
- Writable container root filesystems are deprecated. In this release, startup warns by default; set `ENFORCE_READ_ONLY=true` to hard-fail now. A future major release will require read-only rootfs by default.

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

## Running with Docker (pull from docker hub)

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

### How to tune tmpfs size

Adjust tmpfs size in your container runtime config, not via app environment variables:

- `docker run`: update `tmpfs-size` in each `--mount type=tmpfs,...` argument.
- `docker compose`: update `size=...` in each `tmpfs:` entry.

Example:

- `/data`: `512m` for typical usage, increase to `1g`+ for larger/more budgets.
- `/tmp`: `128m` is usually enough, increase only if you see temp space errors.

### Running as a custom uid/gid

If you need host permission alignment or stricter runtime policies, you can customize uid/gid:

- Build-time (image user id): pass `APP_UID` and `APP_GID` as Docker build args.
- Runtime (container process id): pass `--user` in `docker run` or `user:` in compose.
- Keep `tmpfs uid/gid` aligned with the runtime user so `/data` and `/tmp` remain writable.

Build example:

```bash
docker build \
  --build-arg APP_UID=12345 \
  --build-arg APP_GID=12345 \
  -t seriouslag/actual-auto-sync:custom-user .
```

Runtime example:

```bash
docker run -d \
  --user 12345:12345 \
  --read-only \
  --mount type=tmpfs,destination=/data,tmpfs-size=536870912,tmpfs-mode=0700,uid=12345,gid=12345 \
  --mount type=tmpfs,destination=/tmp,tmpfs-size=134217728,tmpfs-mode=1777,uid=12345,gid=12345 \
  -e ACTUAL_SERVER_URL="your-server-url" \
  -e ACTUAL_SERVER_PASSWORD="your-password" \
  -e ACTUAL_BUDGET_SYNC_IDS="your-sync-id" \
  seriouslag/actual-auto-sync:custom-user
```

Compose example:

```yaml
services:
  actual-auto-sync:
    image: seriouslag/actual-auto-sync:custom-user
    user: '12345:12345'
    read_only: true
    tmpfs:
      - /data:size=512m,mode=0700,uid=12345,gid=12345
      - /tmp:size=128m,mode=1777,uid=12345,gid=12345
```

### Minimal run (compatibility mode)

Use this if you want the simplest setup first (no deprecated options):

```bash
docker run -d \
  -e ACTUAL_SERVER_URL="your-server-url" \
  -e ACTUAL_SERVER_PASSWORD="your-password" \
  -e ACTUAL_BUDGET_SYNC_IDS="your-sync-id" \
  seriouslag/actual-auto-sync:latest
```

```yaml
services:
  actual-auto-sync:
    image: seriouslag/actual-auto-sync:latest
    environment:
      - ACTUAL_SERVER_URL=your-server-url
      - ACTUAL_SERVER_PASSWORD=your-password
      - ACTUAL_BUDGET_SYNC_IDS=your-sync-id
```

This mode is supported for compatibility. For hardened production deployments, use read-only rootfs and tmpfs/volume mounts as shown below.

### direct docker run

```bash
docker run -d \
  --read-only \
  --mount type=tmpfs,destination=/data,tmpfs-size=536870912,tmpfs-mode=0700,uid=1000,gid=1000 \
  --mount type=tmpfs,destination=/tmp,tmpfs-size=134217728,tmpfs-mode=1777,uid=1000,gid=1000 \
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
    read_only: true
    tmpfs:
      - /data:size=512m,mode=0700,uid=1000,gid=1000
      - /tmp:size=128m,mode=1777,uid=1000,gid=1000
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
    read_only: true
    tmpfs:
      - /data:size=512m,mode=0700,uid=1000,gid=1000
      - /tmp:size=128m,mode=1777,uid=1000,gid=1000
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
  are file text files next to your `docker-compose.yml` and containing your secrets

The container checks whether the root filesystem is read-only at startup. By default it logs a deprecation warning if writable. Set `ENFORCE_READ_ONLY=true` to hard-fail when `--read-only`/`read_only: true` is missing.

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
