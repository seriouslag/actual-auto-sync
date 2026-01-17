import { createCronJob } from './cron.js';
import { logger } from './logger.js';

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

const cronJob = createCronJob();
cronJob.start();
