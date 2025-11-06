# Build stage
FROM node:24.11.0-slim AS builder
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
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

# Environment variables
ENV ACTUAL_SERVER_URL=""
ENV ACTUAL_SERVER_PASSWORD=""
# once a day at 1am in America/New_York
ENV CRON_SCHEDULE="0 1 * * *" 
ENV LOG_LEVEL="info"
ENV ACTUAL_BUDGET_SYNC_IDS=""
ENV ENCRYPTION_PASSWORDS=""
ENV TIMEZONE="America/New_York"

# Start the application
CMD ["node", "dist/src/index.js"]
