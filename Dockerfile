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
ARG APP_UID=1000
ARG APP_GID=1000

RUN groupmod --non-unique --gid "${APP_GID}" node \
  && usermod --non-unique --uid "${APP_UID}" --gid "${APP_GID}" node

COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/dist /app/dist

RUN mkdir -p /data \
  && chown node:node /data

# Environment variables
ENV ACTUAL_SERVER_URL=""
ENV ACTUAL_DATA_DIR=""
# once a day at 1am in America/New_York
ENV CRON_SCHEDULE="0 1 * * *"
ENV LOG_LEVEL="info"
ENV ACTUAL_BUDGET_SYNC_IDS=""
ENV ENCRYPTION_PASSWORDS=""
ENV TIMEZONE="America/New_York"

# Start the application
USER node
CMD ["node", "dist/src/index.js"]
