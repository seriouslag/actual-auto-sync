import { createCronJob } from './cron.js';
import { logger } from './logger.js';
import { startWebUi } from './web-ui.js';
import { env } from './env.js';
import { initializeCronSchedule } from './cron-config.js';

// Global error handlers to catch uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(error, 'Uncaught Exception occurred');
});

// These are needed because @actual-app/api throws an unhandled rejection that is not caught by try/catch
process.on('unhandledRejection', (reason, promise) => {
  logger.error(
    {
      reason,
      promise,
    },
    'Unhandled Rejection at Promise; This may be okay to ignore.',
  );
});

const main = async () => {
  await initializeCronSchedule(env.CRON_SCHEDULE);
  const cronJob = createCronJob();
  startWebUi(cronJob);
  cronJob.start();
};

void main().catch((error) => {
  logger.error({ err: error }, 'Failed to start cron job. Exiting.');
  process.exit(1);
});
