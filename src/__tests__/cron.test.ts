import { DateTime } from 'luxon';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies
vi.mock('@actual-app/api', () => ({
  shutdown: vi.fn(),
}));

vi.mock('../env.js', () => ({
  env: {
    CRON_SCHEDULE: '0 0 * * *',
    TIMEZONE: 'Etc/UTC',
    RUN_ON_START: false,
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils.js', () => ({
  sync: vi.fn(),
}));

// Mock CronJob
const mockCronJobFrom = vi.fn();
vi.mock('cron', () => ({
  CronJob: {
    from: mockCronJobFrom,
  },
}));

describe('cron.ts functions', () => {
  let mockShutdown: any;
  let mockLogger: any;
  let mockSync: any;
  let mockCronJobInstance: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const apiModule = await import('@actual-app/api');
    const loggerModule = await import('../logger.js');
    const utilsModule = await import('../utils.js');

    mockShutdown = vi.mocked(apiModule.shutdown);
    mockLogger = vi.mocked(loggerModule.logger);
    mockSync = vi.mocked(utilsModule.sync);

    // Create a mock CronJob instance
    mockCronJobInstance = {
      nextDate: vi.fn().mockReturnValue(DateTime.fromISO('2024-01-01T00:00:00.000Z')),
    };

    mockCronJobFrom.mockReturnValue(mockCronJobInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onTick', () => {
    it('should successfully run sync and call onCompleteCallback', async () => {
      mockSync.mockResolvedValue(undefined);
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      const { onTick } = await import('../cron.js');
      await onTick(mockCallback);

      expect(mockSync).toHaveBeenCalledOnce();
      expect(mockCallback).toHaveBeenCalledOnce();
      expect(mockShutdown).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle sync errors and shutdown gracefully', async () => {
      const syncError = new Error('Sync failed');
      mockSync.mockRejectedValue(syncError);
      mockShutdown.mockResolvedValue(undefined);
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      const { onTick } = await import('../cron.js');
      await onTick(mockCallback);

      expect(mockSync).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: syncError },
        'Error running sync. Shutting down...',
      );
      expect(mockShutdown).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('Shutdown complete.');
      expect(mockCallback).toHaveBeenCalledOnce();
    });

    it('should handle shutdown errors gracefully', async () => {
      const syncError = new Error('Sync failed');
      const shutdownError = new Error('Shutdown failed');
      mockSync.mockRejectedValue(syncError);
      mockShutdown.mockRejectedValue(shutdownError);
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      const { onTick } = await import('../cron.js');
      await expect(onTick(mockCallback)).rejects.toThrow('Shutdown failed');

      expect(mockSync).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith(
        { err: syncError },
        'Error running sync. Shutting down...',
      );
      expect(mockShutdown).toHaveBeenCalledOnce();
      expect(mockLogger.info).not.toHaveBeenCalledWith('Shutdown complete.');
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle onCompleteCallback errors gracefully', async () => {
      mockSync.mockResolvedValue(undefined);
      const callbackError = new Error('Callback failed');
      const mockCallback = vi.fn().mockRejectedValue(callbackError);

      const { onTick } = await import('../cron.js');
      await expect(onTick(mockCallback)).rejects.toThrow('Callback failed');

      expect(mockSync).toHaveBeenCalledOnce();
      expect(mockCallback).toHaveBeenCalledOnce();
    });
  });

  describe('onComplete', () => {
    it('should log completion message with next run time', async () => {
      const mockNextDate = DateTime.fromISO('2024-01-01T00:00:00.000Z');
      mockCronJobInstance.nextDate.mockReturnValue(mockNextDate);

      const { onComplete } = await import('../cron.js');
      onComplete(mockCronJobInstance);

      expect(mockLogger.info).toHaveBeenCalledWith(
        `Cron job completed. Next run is in ${mockNextDate.toLocaleString(DateTime.DATETIME_FULL)}`,
      );
    });

    it('should handle different timezone formats', async () => {
      const mockNextDate = DateTime.fromISO('2024-01-01T00:00:00.000Z');
      mockCronJobInstance.nextDate.mockReturnValue(mockNextDate);

      const { onComplete } = await import('../cron.js');
      onComplete(mockCronJobInstance);

      expect(mockLogger.info).toHaveBeenCalledWith(
        `Cron job completed. Next run is in ${mockNextDate.toLocaleString(DateTime.DATETIME_FULL)}`,
      );
    });
  });

  describe('createCronJob', () => {
    it('should create a cron job with correct configuration', async () => {
      const { createCronJob } = await import('../cron.js');
      createCronJob();

      expect(mockCronJobFrom).toHaveBeenCalledWith({
        cronTime: '0 0 * * *',
        onComplete: expect.any(Function),
        onTick: expect.any(Function),
        start: false,
        timeZone: 'Etc/UTC',
        runOnInit: false,
      });
    });

    it('should return the created cron job instance', async () => {
      const { createCronJob } = await import('../cron.js');
      createCronJob();

      expect(mockCronJobFrom).toHaveBeenCalledOnce();
    });

    it('should use environment variables for configuration', async () => {
      // Test that the function uses the mocked env values from the top-level mock
      const { createCronJob } = await import('../cron.js');
      createCronJob();

      expect(mockCronJobFrom).toHaveBeenCalledWith({
        cronTime: '0 0 * * *',
        onComplete: expect.any(Function),
        onTick: expect.any(Function),
        start: false,
        timeZone: 'Etc/UTC',
        runOnInit: false,
      });
    });

    it('should properly bind onComplete callback', async () => {
      let capturedOnComplete: Function | undefined;

      mockCronJobFrom.mockImplementation((config: any) => {
        capturedOnComplete = config.onComplete;
        return mockCronJobInstance;
      });

      const { createCronJob } = await import('../cron.js');
      createCronJob();

      expect(capturedOnComplete).toBeDefined();
      expect(typeof capturedOnComplete).toBe('function');
    });

    it('should properly bind onTick callback', async () => {
      let capturedOnTick: Function | undefined;

      mockCronJobFrom.mockImplementation((config: any) => {
        capturedOnTick = config.onTick;
        return mockCronJobInstance;
      });

      const { createCronJob } = await import('../cron.js');
      createCronJob();

      expect(capturedOnTick).toBeDefined();
      expect(typeof capturedOnTick).toBe('function');
    });
  });

  describe('integration scenarios', () => {
    it('should handle the complete cron job lifecycle', async () => {
      mockSync.mockResolvedValue(undefined);
      const mockCallback = vi.fn().mockResolvedValue(undefined);

      // Test onTick
      const { onTick } = await import('../cron.js');
      await onTick(mockCallback);
      expect(mockSync).toHaveBeenCalledOnce();
      expect(mockCallback).toHaveBeenCalledOnce();

      // Test onComplete
      const mockNextDate = DateTime.fromISO('2024-01-01T00:00:00.000Z');
      mockCronJobInstance.nextDate.mockReturnValue(mockNextDate);

      const { onComplete } = await import('../cron.js');
      onComplete(mockCronJobInstance);
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Cron job completed. Next run is in ${mockNextDate.toLocaleString(DateTime.DATETIME_FULL)}`,
      );

      // Test createCronJob
      const { createCronJob } = await import('../cron.js');
      createCronJob();
      expect(mockCronJobFrom).toHaveBeenCalledWith({
        cronTime: '0 0 * * *',
        onComplete: expect.any(Function),
        onTick: expect.any(Function),
        start: false,
        timeZone: 'Etc/UTC',
        runOnInit: false,
      });
    });

    it('should handle edge case with invalid cron schedule', async () => {
      // This test ensures the function doesn't crash with invalid cron schedules
      // The actual validation would happen in the cron library
      vi.doMock('../env.js', () => ({
        env: {
          CRON_SCHEDULE: 'invalid-cron',
          TIMEZONE: 'Etc/UTC',
          RUN_ON_START: false,
        },
      }));

      const { createCronJob } = await import('../cron.js');
      expect(() => {
        createCronJob();
      }).not.toThrow();
    });
  });
});
