# Build stage
FROM node:24.13.0-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Copy source files
COPY . /app

WORKDIR /app

FROM builder AS build
RUN corepack enable
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build


FROM builder
# UID/GID of the runtime user. Override at build time to match a host user, e.g.
# `docker build --build-arg APP_UID=1001 --build-arg APP_GID=1001 .`
ARG APP_UID=1000
ARG APP_GID=1000

# Repoint the pre-existing `node` user/group to the requested UID/GID.
RUN groupmod --non-unique --gid "${APP_GID}" node \
  && usermod --non-unique --uid "${APP_UID}" --gid "${APP_GID}" node

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/dist /app/dist

# Writable data directory owned by the runtime user so the rest of the root
# filesystem can be mounted read-only.
RUN mkdir -p /data && chown node:node /data

# Environment variables
ENV ACTUAL_SERVER_URL=""
# Keep budget data/caches on the writable mount so `--read-only` works.
ENV ACTUAL_DATA_DIR="/data"
# once a day at 1am in America/New_York
ENV CRON_SCHEDULE="0 1 * * *"
ENV LOG_LEVEL="info"
ENV ACTUAL_BUDGET_SYNC_IDS=""
ENV ENCRYPTION_PASSWORDS=""
ENV TIMEZONE="America/New_York"

# Run as the unprivileged node user
USER node

# Start the application
CMD ["node", "dist/src/index.js"]
