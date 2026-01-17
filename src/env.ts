import { createEnv } from '@t3-oss/env-core';
import { config } from 'dotenv';
import { IANAZone } from 'luxon';
import { pino } from 'pino';
import { z } from 'zod';

const logger = pino({
  level: 'info',
});

try {
  config();
  logger.info('Loaded environment variables from .env file.');
} catch {
  logger.info('No .env file found. Using system environment variables.');
}

export const budgetIdSchema = z
  .string()
  .transform((value) => value.split(','))
  .pipe(z.string().array());

export const encryptionPasswordSchema = z
  .string()
  .default('')
  .optional()
  .transform((value) => value?.split(','))
  .pipe(z.string().array().optional())
  .default([]);

/**
 * Default to once a day at 1am
 * @default "0 1 * * *"
 */
export const cronScheduleSchema = z.string().trim().min(9).default('0 1 * * *');

/**
 * Default to false
 * @default false
 */
export const runOnStartSchema = z
  .union([z.string(), z.boolean()])
  .optional()
  .default(false)
  .transform((value) => {
    const loweredValue = typeof value === 'string' ? value.trim().toLowerCase() : value;
    switch (loweredValue) {
      case true:
      case 'on':
      case 'yes':
      case '1':
      case 'true':
        return true;
      case false:
      case 'off':
      case 'no':
      case '0':
      case 'false':
        return false;
      default:
        return false;
    }
  });

/**
 * Default to info
 * @default "info"
 */
export const logLevelSchema = z.enum(['info', 'debug', 'warn', 'error']).optional().default('info');

/**
 * @default "Etc/UTC"
 */
export const timezoneSchema = z
  .string()
  .trim()
  .refine((tz) => IANAZone.isValidZone(tz), {
    message: 'Invalid IANA time zone (e.g., Etc/UTC, America/New_York).',
  })
  .default('Etc/UTC');

/**
 * Server URL
 */
export const serverUrlSchema = z.string().trim().min(1);

/**
 * Server password
 */
export const serverPasswordSchema = z.string().min(1);

export const env = createEnv({
  server: {
    ACTUAL_SERVER_URL: serverUrlSchema,
    ACTUAL_SERVER_PASSWORD: serverPasswordSchema,
    CRON_SCHEDULE: cronScheduleSchema,
    LOG_LEVEL: logLevelSchema,
    ACTUAL_BUDGET_SYNC_IDS: budgetIdSchema,
    ENCRYPTION_PASSWORDS: encryptionPasswordSchema,
    TIMEZONE: timezoneSchema,
    RUN_ON_START: runOnStartSchema,
  },

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: 'PUBLIC_',

  client: {},

  /**
   * What object holds the environment variables at runtime. This is usually
   * `process.env` or `import.meta.env`.
   */
  runtimeEnv: process.env,

  /**
   * By default, this library will feed the environment variables directly to
   * the Zod validator.
   *
   * This means that if you have an empty string for a value that is supposed
   * to be a number (e.g. `PORT=` in a ".env" file), Zod will incorrectly flag
   * it as a type mismatch violation. Additionally, if you have an empty string
   * for a value that is supposed to be a string with a default value (e.g.
   * `DOMAIN=` in an ".env" file), the default value will never be applied.
   *
   * In order to solve these issues, we recommend that all new projects
   * explicitly specify this option as true.
   */
  emptyStringAsUndefined: true,
});
