# Build stage
FROM node:22-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copy source files
COPY . /app

WORKDIR /app

FROM builder AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build


FROM builder
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

# Environment variables
ENV ACTUAL_DATA_DIR=./data
ENV ACTUAL_SERVER_URL=""
ENV ACTUAL_SERVER_PASSWORD=""
ENV CRON_SCHEDULE="0 1 * * *"
ENV LOG_LEVEL="info"

# Start the application
CMD ["pnpm", "start"]
