import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { pino } from "pino";
import { z } from "zod/v4";

const logger = pino({
  level: "info",
});

try {
  config();
  logger.info("Loaded environment variables from .env file.");
} catch {
  logger.info("No .env file found. Using system environment variables.");
}

const budgetIdSchema = z
  .string()
  .transform((value) => value.split(","))
  .pipe(z.string().array());

const encryptionPasswordSchema = z
  .string()
  .default("")
  .optional()
  .transform((value) => value?.split(","))
  .pipe(z.string().array().optional())
  .default([]);

export const env = createEnv({
  server: {
    ACTUAL_SERVER_URL: z.string().min(1),
    ACTUAL_SERVER_PASSWORD: z.string().min(1),
    // default to once a day at 1am
    CRON_SCHEDULE: z.string().min(9).default("0 1 * * *"),
    LOG_LEVEL: z
      .enum(["info", "debug", "warn", "error"])
      .optional()
      .default("info"),
    ACTUAL_BUDGET_SYNC_IDS: budgetIdSchema,
    ENCRYPTION_PASSWORDS: encryptionPasswordSchema,
    TIMEZONE: z.string().default("UTC"),
    RUN_ON_START: z.boolean().default(false),
  },

  /**
   * The prefix that client-side variables must have. This is enforced both at
   * a type-level and at runtime.
   */
  clientPrefix: "PUBLIC_",

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
