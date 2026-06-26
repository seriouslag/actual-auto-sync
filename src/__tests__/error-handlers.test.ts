import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('error-handlers.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerUncaughtExceptionHandler', () => {
    it('registers a handler that logs uncaught exceptions', async () => {
      const { logger } = await import('../logger.js');

      let capturedHandler: ((error: Error) => void) | undefined;
      vi.spyOn(process, 'on').mockImplementation((event: string | symbol, handler: any) => {
        if (event === 'uncaughtException') {
          capturedHandler = handler;
        }
        return process;
      });

      const { registerUncaughtExceptionHandler } = await import('../error-handlers.js');
      registerUncaughtExceptionHandler();

      expect(capturedHandler).toBeDefined();
      const error = new Error('boom');
      capturedHandler!(error);

      expect(logger.error).toHaveBeenCalledWith(error, 'Uncaught Exception occurred');
    });
  });

  describe('registerUnhandledRejectionHandler', () => {
    it('registers a handler that logs unhandled rejections', async () => {
      const { logger } = await import('../logger.js');

      let capturedHandler: ((reason: unknown, promise: Promise<unknown>) => void) | undefined;
      vi.spyOn(process, 'on').mockImplementation((event: string | symbol, handler: any) => {
        if (event === 'unhandledRejection') {
          capturedHandler = handler;
        }
        return process;
      });

      const { registerUnhandledRejectionHandler } = await import('../error-handlers.js');
      registerUnhandledRejectionHandler();

      expect(capturedHandler).toBeDefined();
      const reason = new Error('rejected');
      const promise = Promise.resolve();
      capturedHandler!(reason, promise);

      expect(logger.error).toHaveBeenCalledWith(
        { reason, promise },
        'Unhandled Rejection at Promise; This may be okay to ignore.',
      );
    });
  });
});
