import {
  READ_ONLY_REQUIRED_MESSAGE,
  isContainerRootFilesystemReadOnly,
  shouldEnforceReadOnlyRootFilesystem,
} from './container-security.js';
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

try {
  const { isContainer, isReadOnly } = await isContainerRootFilesystemReadOnly();
  if (isContainer && !isReadOnly) {
    const message = `${READ_ONLY_REQUIRED_MESSAGE} This will become a required default in the next major release.`;
    if (shouldEnforceReadOnlyRootFilesystem()) {
      logger.error(message);
      throw new Error(message);
    }
    logger.warn(
      `${message} Compatibility mode is active because ENFORCE_READ_ONLY is not enabled.`,
    );
  }
} catch (error) {
  logger.error({ err: error }, 'Container security validation failed.');
  throw error;
}

const cronJob = createCronJob();
cronJob.start();
