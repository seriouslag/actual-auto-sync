# Default image (linux/amd64 + linux/arm64), on the same Node.js 24 Debian
# base as Actual Budget's server image. The official node:24 images are not
# built for linux/arm/v7; that platform is published by `Dockerfile.alpine`
# under the `-alpine` tags.
#
# Base image shared by the build and runtime stages. It holds no project files,
# so the runtime image carries only what the final stage copies in.
FROM node:24.18.1-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

FROM base AS build
# No compiler toolchain: better-sqlite3 13 loads its bundled prebuild on both
# platforms this image targets (amd64, arm64) and does not build on install.
RUN corepack enable
# Install from the dependency manifests alone so this layer (including the slow
# arm/v7 SQLite compile) is reused from cache until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build


FROM base
# UID/GID of the runtime user. Override at build time to match a host user, e.g.
# `docker build --build-arg APP_UID=1001 --build-arg APP_GID=1001 .`
ARG APP_UID=1000
ARG APP_GID=1000

# Repoint the pre-existing `node` user/group to the requested UID/GID.
RUN groupmod --non-unique --gid "${APP_GID}" node \
  && usermod --non-unique --uid "${APP_UID}" --gid "${APP_GID}" node

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
# package.json marks dist/ as ES modules ("type": "module").
COPY --from=build --chown=node:node /app/package.json /app/package.json
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
