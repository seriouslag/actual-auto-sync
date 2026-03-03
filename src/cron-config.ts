import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { cronScheduleSchema } from './env.js';
import { logger } from './logger.js';

const CONFIG_DIR = './data';
const CONFIG_FILE = join(CONFIG_DIR, 'web-ui-config.json');

let initialized = false;
let currentSchedule: string | undefined;

interface PersistedConfig {
  cronSchedule?: string;
}

export async function initializeCronSchedule(defaultSchedule: string): Promise<void> {
  if (initialized) {
    return;
  }

  currentSchedule = defaultSchedule;
  try {
    const payload = JSON.parse(await readFile(CONFIG_FILE, 'utf8')) as PersistedConfig;
    if (typeof payload.cronSchedule === 'string') {
      const parsed = cronScheduleSchema.safeParse(payload.cronSchedule);
      if (parsed.success) {
        currentSchedule = parsed.data;
      } else {
        logger.warn({ payload: payload.cronSchedule, issues: parsed.error.issues }, 'Ignoring invalid persisted cron schedule.');
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn({ err: error }, 'Unable to read persisted cron configuration.');
    }
  } finally {
    initialized = true;
  }
}

export function getCronSchedule(): string {
  if (!initialized || !currentSchedule) {
    throw new Error('Cron schedule has not been initialized yet.');
  }
  return currentSchedule;
}

export async function setCronSchedule(schedule: string): Promise<void> {
  const parsed = cronScheduleSchema.parse(schedule);
  currentSchedule = parsed;
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify({ cronSchedule: parsed }, null, 2), 'utf8');
  logger.info({ cronSchedule: parsed }, 'Cron schedule persisted to disk.');
}

export function resetCronSchedule(): void {
  initialized = false;
  currentSchedule = undefined;
}
