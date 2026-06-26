import { logger } from './logger.js';

export function registerUncaughtExceptionHandler(): void {
  process.on('uncaughtException', (error) => {
    logger.error(error, 'Uncaught Exception occurred');
  });
}

// Needed because @actual-app/api throws unhandled rejections that are not caught by try/catch.
export function registerUnhandledRejectionHandler(): void {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(
      { reason, promise },
      'Unhandled Rejection at Promise; This may be okay to ignore.',
    );
  });
}
