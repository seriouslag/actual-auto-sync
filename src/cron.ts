import { shutdown } from '@actual-app/api';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';

import { env } from './env.js';
import { logger } from './logger.js';
import { sync } from './utils.js';

export async function onTick(onCompleteCallback: () => Promise<void> | void) {
  try {
    await sync();
  } catch (err) {
    logger.error({ err }, 'Error running sync. Shutting down...');
    await shutdown();
    logger.info('Shutdown complete.');
  }
  await onCompleteCallback();
}

export function onComplete(cronJob: CronJob<() => void, null>): void {
  logger.info(
    `Cron job completed. Next run is in ${cronJob
      .nextDate()
      .toLocaleString(DateTime.DATETIME_FULL)}`,
  );
}

export function createCronJob(): CronJob<() => void, null> {
  const cronJob: CronJob<() => void, null> = CronJob.from<() => void, null>({
    cronTime: env.CRON_SCHEDULE,
    onComplete: () => onComplete(cronJob),
    onTick,
    start: false,
    timeZone: env.TIMEZONE,
    runOnInit: env.RUN_ON_START,
  });
  return cronJob;
}
