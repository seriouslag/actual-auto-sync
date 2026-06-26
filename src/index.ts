import { createCronJob } from './cron.js';
import {
  registerUncaughtExceptionHandler,
  registerUnhandledRejectionHandler,
} from './error-handlers.js';

registerUncaughtExceptionHandler();
registerUnhandledRejectionHandler();

const cronJob = createCronJob();
cronJob.start();
