import { pino } from 'pino';

// The level is configured from validated env in `env.ts` once it is available.
// Keeping this module free of an `env` import avoids a circular dependency and
// lets env.ts set the level (and decide log verbosity) during startup.
export const logger = pino({});

/**
 * Whether the given log level should surface verbose third-party output, such
 * as the noisy console logging emitted by `@actual-app/api` during sync. Only
 * `debug`/`info` are considered verbose; `warn`/`error` keep the output quiet.
 */
export function isVerbose(logLevel: string): boolean {
  return ['debug', 'info'].includes(logLevel);
}
