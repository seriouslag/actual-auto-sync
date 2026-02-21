import { readFile, readdir } from 'node:fs/promises';

import { internal, runBankSync, sync as syncBudget } from '@actual-app/api';
import cronstrue from 'cronstrue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  formatCronSchedule,
  getSyncIdMaps,
  listSubDirectories,
  sync,
  syncAccountBalancesToCRDT,
  syncAllAccounts,
} from '../utils.js';

// Mock external dependencies
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('@actual-app/api', () => ({
  init: vi.fn(),
  shutdown: vi.fn(),
  runBankSync: vi.fn(),
  downloadBudget: vi.fn(),
  loadBudget: vi.fn(),
  sync: vi.fn(),
  internal: {
    db: {
      getAccounts: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Import mocked functions
const { init, shutdown, downloadBudget } = await import('@actual-app/api');
const { mkdir, rm } = await import('node:fs/promises');

vi.mock('cronstrue', () => ({
  default: {
    toString: vi.fn(),
  },
}));

vi.mock('../env.js', () => ({
  env: {
    ACTUAL_SERVER_URL: 'http://localhost:5006',
    ACTUAL_SERVER_PASSWORD: 'test-password',
    CRON_SCHEDULE: '0 0 * * *',
    ACTUAL_BUDGET_SYNC_IDS: ['budget1', 'budget2'],
    ENCRYPTION_PASSWORDS: ['pass1', 'pass2'],
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

describe('utils.ts functions', () => {
  const mutableEnv = env as unknown as {
    ACTUAL_BUDGET_SYNC_IDS: string[];
    ENCRYPTION_PASSWORDS: string[];
  };
  let cronstrueMock: { toString: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    cronstrueMock = cronstrue as unknown as {
      toString: ReturnType<typeof vi.fn>;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatCronSchedule', () => {
    it('should format cron schedule using cronstrue', () => {
      cronstrueMock.toString.mockReturnValue('At 12:00 AM');

      const result = formatCronSchedule('0 0 * * *');

      expect(cronstrueMock.toString).toHaveBeenCalledWith('0 0 * * *');
      expect(result).toBe('at 12:00 am');
    });

    it('should convert result to lowercase', () => {
      cronstrueMock.toString.mockReturnValue('EVERY DAY AT MIDNIGHT');

      const result = formatCronSchedule('0 0 * * *');
      expect(result).toBe('every day at midnight');
    });
  });

  describe('syncAllAccounts', () => {
    beforeEach(() => {
      vi.mocked(internal.db.getAccounts).mockResolvedValue([
        { id: 'acc-1', balance_current: 12_345 },
        { id: 'acc-2', balance_current: null },
      ]);
      vi.mocked(internal.db.update).mockResolvedValue(undefined);
    });

    it('should successfully sync all accounts and sync budget to server', async () => {
      vi.mocked(runBankSync).mockResolvedValue(undefined);
      vi.mocked(syncBudget).mockResolvedValue(undefined);

      await syncAllAccounts();

      expect(logger.info).toHaveBeenCalledWith('Syncing all accounts...');
      expect(runBankSync).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('All accounts synced.');
      expect(logger.info).toHaveBeenCalledWith('Syncing account balances through CRDT...');
      expect(internal.db.getAccounts).toHaveBeenCalled();
      expect(internal.db.update).toHaveBeenCalledWith('accounts', {
        id: 'acc-1',
        balance_current: 12_345,
      });
      expect(logger.info).toHaveBeenCalledWith('Account balances synced through CRDT.');
      expect(logger.info).toHaveBeenCalledWith('Syncing budget to server...');
      expect(syncBudget).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Budget synced to server successfully.');
    });

    it('should handle errors during bank sync', async () => {
      const error = new Error('Sync failed');
      vi.mocked(runBankSync).mockRejectedValue(error);

      await expect(syncAllAccounts()).rejects.toThrow('Sync failed');

      expect(syncBudget).not.toHaveBeenCalled();
    });

    it('should handle errors during budget sync to server', async () => {
      const error = new Error('Budget sync failed');
      vi.mocked(runBankSync).mockResolvedValue(undefined);
      vi.mocked(syncBudget).mockRejectedValue(error);

      await expect(syncAllAccounts()).rejects.toThrow('Budget sync failed');

      expect(runBankSync).toHaveBeenCalled();
    });

    it('should continue syncing budget when account balance CRDT sync has errors', async () => {
      const error = new Error('DB read failed');
      vi.mocked(runBankSync).mockResolvedValue(undefined);
      vi.mocked(internal.db.getAccounts).mockRejectedValue(error);
      vi.mocked(syncBudget).mockResolvedValue(undefined);

      await syncAllAccounts();

      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        'Error syncing account balances through CRDT',
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Account balances sync through CRDT completed with errors.',
      );
      expect(syncBudget).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Budget synced to server successfully.');
    });
  });

  describe('syncAccountBalancesToCRDT', () => {
    it('should sync non-null account balances through CRDT', async () => {
      vi.mocked(internal.db.getAccounts).mockResolvedValue([
        { id: 'acc-1', balance_current: 1000 },
        { id: 'acc-2', balance_current: null },
        { id: 'acc-3', balance_current: -500 },
      ]);
      vi.mocked(internal.db.update).mockResolvedValue(undefined);

      const result = await syncAccountBalancesToCRDT();

      expect(result).toBe(true);
      expect(internal.db.update).toHaveBeenCalledTimes(2);
      expect(internal.db.update).toHaveBeenCalledWith('accounts', {
        id: 'acc-1',
        balance_current: 1000,
      });
      expect(internal.db.update).toHaveBeenCalledWith('accounts', {
        id: 'acc-3',
        balance_current: -500,
      });
    });

    it('should log errors from getAccounts and continue', async () => {
      const error = new Error('DB read failed');
      vi.mocked(internal.db.getAccounts).mockRejectedValue(error);

      const result = await syncAccountBalancesToCRDT();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        'Error syncing account balances through CRDT',
      );
    });

    it('should log errors from update and continue with remaining accounts', async () => {
      const error = new Error('DB update failed');
      vi.mocked(internal.db.getAccounts).mockResolvedValue([
        { id: 'acc-1', balance_current: 100 },
        { id: 'acc-2', balance_current: 200 },
      ]);
      vi.mocked(internal.db.update).mockRejectedValueOnce(error).mockResolvedValue(undefined);

      const result = await syncAccountBalancesToCRDT();

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        { err: error, accountId: 'acc-1' },
        'Error syncing account balance through CRDT for account',
      );
      expect(internal.db.update).toHaveBeenCalledTimes(2);
      expect(internal.db.update).toHaveBeenNthCalledWith(1, 'accounts', {
        id: 'acc-1',
        balance_current: 100,
      });
      expect(internal.db.update).toHaveBeenNthCalledWith(2, 'accounts', {
        id: 'acc-2',
        balance_current: 200,
      });
    });
  });

  describe('listSubDirectories', () => {
    it('should return only directory names', async () => {
      const mockDirents = [
        { name: 'dir1', isDirectory: () => true },
        { name: 'file1', isDirectory: () => false },
        { name: 'dir2', isDirectory: () => true },
        { name: 'file2', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof readdir>>;

      vi.mocked(readdir).mockResolvedValue(mockDirents);

      const result = await listSubDirectories('/test/path');

      expect(readdir).toHaveBeenCalledWith('/test/path', {
        withFileTypes: true,
      });
      expect(result).toEqual(['dir1', 'dir2']);
    });

    it('should handle empty directory', async () => {
      vi.mocked(readdir).mockResolvedValue([]);

      const result = await listSubDirectories('/test/path');

      expect(result).toEqual([]);
    });

    it('should handle readdir errors', async () => {
      const error = new Error('Permission denied');
      vi.mocked(readdir).mockRejectedValue(error);

      await expect(listSubDirectories('/test/path')).rejects.toThrow('Permission denied');
    });
  });

  describe('getSyncIdMaps', () => {
    it('should create sync id to budget id mapping', async () => {
      const mockMetadata1 = { groupId: 'sync1', id: 'budget1' };
      const mockMetadata2 = { groupId: 'sync2', id: 'budget2' };

      vi.mocked(readdir).mockResolvedValue([
        { name: 'dir1', isDirectory: () => true },
        { name: 'dir2', isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);

      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify(mockMetadata1))
        .mockResolvedValueOnce(JSON.stringify(mockMetadata2));

      const result = await getSyncIdMaps('/test/data');

      expect(readFile).toHaveBeenCalledWith('/test/data/dir1/metadata.json', 'utf8');
      expect(readFile).toHaveBeenCalledWith('/test/data/dir2/metadata.json', 'utf8');
      expect(result).toEqual({
        sync1: 'budget1',
        sync2: 'budget2',
      });
    });

    it('should handle metadata parsing errors', async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: 'dir1', isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);
      vi.mocked(readFile).mockResolvedValue('invalid json');

      await expect(getSyncIdMaps('/test/data')).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle readFile errors', async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: 'dir1', isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);
      vi.mocked(readFile).mockRejectedValue(new Error('File not found'));

      await expect(getSyncIdMaps('/test/data')).rejects.toThrow('File not found');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('sync', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Mock successful responses by default
      vi.mocked(init).mockResolvedValue(undefined as never);
      vi.mocked(shutdown).mockResolvedValue(undefined as never);
      vi.mocked(downloadBudget).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(runBankSync).mockResolvedValue(undefined);
      vi.mocked(syncBudget).mockResolvedValue(undefined);
      vi.mocked(internal.db.getAccounts).mockResolvedValue([]);
      vi.mocked(internal.db.update).mockResolvedValue(undefined);

      // Ensure cronstrue mock returns a valid string
      cronstrueMock.toString.mockReturnValue('every day at midnight');

      // Mock getSyncIdMaps to return a mapping that matches the env.ACTUAL_BUDGET_SYNC_IDS
      mutableEnv.ACTUAL_BUDGET_SYNC_IDS = ['budget1', 'budget2'];
      mutableEnv.ENCRYPTION_PASSWORDS = ['pass1', 'pass2'];
      vi.mocked(readdir).mockResolvedValue([
        { name: 'dir1', isDirectory: () => true },
        { name: 'dir2', isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);
      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify({ groupId: 'budget1', id: 'budget1' }))
        .mockResolvedValueOnce(JSON.stringify({ groupId: 'budget2', id: 'budget2' }));
    });

    it('should complete the sync process successfully', async () => {
      await sync();

      // Verify the main flow was executed
      expect(mkdir).toHaveBeenCalledWith('./data', { recursive: true });
      expect(init).toHaveBeenCalledWith({
        dataDir: './data',
        serverURL: 'http://localhost:5006',
        password: 'test-password',
      });
      expect(cronstrueMock.toString).toHaveBeenCalledWith('0 0 * * *');
      expect(shutdown).toHaveBeenCalled();
    });

    it('should download budgets without encryption password when password is missing', async () => {
      mutableEnv.ENCRYPTION_PASSWORDS = ['pass1'];

      await sync();

      expect(downloadBudget).toHaveBeenCalledWith('budget1', {
        password: 'pass1',
      });
      expect(downloadBudget).toHaveBeenCalledWith('budget2');
    });

    it('should process budget download operations sequentially', async () => {
      let activeOperations = 0;
      let maxConcurrentOperations = 0;

      const trackOperation = async () => {
        activeOperations += 1;
        maxConcurrentOperations = Math.max(maxConcurrentOperations, activeOperations);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeOperations -= 1;
      };

      vi.mocked(downloadBudget).mockImplementation(trackOperation);

      await sync();

      expect(downloadBudget).toHaveBeenCalledTimes(2);
      expect(maxConcurrentOperations).toBe(1);
    });

    it('should sync each budget immediately after it is downloaded', async () => {
      await sync();

      expect(downloadBudget).toHaveBeenCalledTimes(2);
      expect(runBankSync).toHaveBeenCalledTimes(2);
      expect(syncBudget).toHaveBeenCalledTimes(2);

      const firstDownloadOrder = vi.mocked(downloadBudget).mock.invocationCallOrder[0];
      const firstBankSyncOrder = vi.mocked(runBankSync).mock.invocationCallOrder[0];
      const secondDownloadOrder = vi.mocked(downloadBudget).mock.invocationCallOrder[1];
      const secondBankSyncOrder = vi.mocked(runBankSync).mock.invocationCallOrder[1];

      expect(firstDownloadOrder).toBeLessThan(firstBankSyncOrder);
      expect(firstBankSyncOrder).toBeLessThan(secondDownloadOrder);
      expect(secondDownloadOrder).toBeLessThan(secondBankSyncOrder);
    });

    it('should retry a failed budget download once and continue with remaining budgets', async () => {
      const error = new Error('Download failed');
      vi.mocked(downloadBudget).mockRejectedValueOnce(error).mockResolvedValue(undefined);

      await sync();

      expect(downloadBudget).toHaveBeenCalledTimes(3);
      expect(runBankSync).toHaveBeenCalledTimes(2);
      expect(syncBudget).toHaveBeenCalledTimes(2);
      expect(downloadBudget).toHaveBeenCalledWith('budget2', {
        password: 'pass2',
      });
      expect(init).toHaveBeenCalledTimes(2);
      expect(shutdown).toHaveBeenCalledTimes(2);
    });

    it('should avoid startServices race errors when syncing multiple budgets', async () => {
      let activeDownloads = 0;
      const raceError = new Error('App: startServices called while services are already running');

      vi.mocked(downloadBudget).mockImplementation(async () => {
        activeDownloads += 1;
        if (activeDownloads > 1) {
          activeDownloads -= 1;
          throw raceError;
        }

        await new Promise((resolve) => setTimeout(resolve, 5));
        activeDownloads -= 1;
      });

      await sync();

      expect(downloadBudget).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalledWith(
        { err: raceError },
        expect.stringContaining('Error downloading budget'),
      );
    });

    it('should log budget download errors after retries and continue', async () => {
      const error = new Error('Download failed');
      vi.mocked(downloadBudget)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(undefined);
      vi.mocked(readFile).mockReset();
      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify({ groupId: 'budget1', id: 'local-budget-1' }))
        .mockResolvedValueOnce(JSON.stringify({ groupId: 'budget2', id: 'local-budget-2' }))
        .mockResolvedValueOnce(JSON.stringify({ groupId: 'budget1', id: 'local-budget-1' }));

      await sync();

      expect(vi.mocked(rm)).toHaveBeenCalledWith('data/dir1', { recursive: true, force: true });
      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        'Failed to sync budget budget1 after retries.',
      );
      expect(downloadBudget).toHaveBeenCalledTimes(3);
      expect(downloadBudget).toHaveBeenCalledWith('budget2', {
        password: 'pass2',
      });
      expect(shutdown).toHaveBeenCalled();
    });

    it('should log debug and warn when retry cache metadata does not match the failed budget', async () => {
      const downloadError = new Error('Download failed');
      vi.mocked(downloadBudget).mockRejectedValueOnce(downloadError).mockResolvedValue(undefined);
      vi.mocked(readdir).mockResolvedValue([
        { name: 'dir1', isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);
      vi.mocked(readFile).mockReset();
      vi.mocked(readFile).mockResolvedValue(
        JSON.stringify({ groupId: 'another-budget', id: 'local-budget-1' }),
      );

      await sync();

      expect(logger.debug).toHaveBeenCalledWith(
        {
          budgetId: 'budget1',
          metadataPath: 'data/dir1/metadata.json',
          metadataGroupId: 'another-budget',
        },
        'Local budget metadata does not match sync ID during cache scan.',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { budgetId: 'budget1' },
        'No local cache found for budget budget1; retrying without deleting cache.',
      );
    });

    it('should skip non-directory entries while scanning retry cache', async () => {
      const downloadError = new Error('Download failed');
      vi.mocked(downloadBudget).mockRejectedValueOnce(downloadError).mockResolvedValue(undefined);
      vi.mocked(readdir).mockResolvedValue([
        { name: 'not-a-directory.txt', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);
      vi.mocked(readFile).mockReset();

      await sync();

      expect(readFile).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        { budgetId: 'budget1' },
        'No local cache found for budget budget1; retrying without deleting cache.',
      );
    });

    it('should log debug when retry cache metadata cannot be read', async () => {
      const downloadError = new Error('Download failed');
      const metadataReadError = new Error('Metadata read failed');
      vi.mocked(downloadBudget).mockRejectedValueOnce(downloadError).mockResolvedValue(undefined);
      vi.mocked(readdir).mockResolvedValue([
        { name: 'dir1', isDirectory: () => true },
      ] as unknown as Awaited<ReturnType<typeof readdir>>);
      vi.mocked(readFile).mockReset();
      vi.mocked(readFile).mockRejectedValue(metadataReadError);

      await sync();

      expect(logger.debug).toHaveBeenCalledWith(
        { err: metadataReadError, budgetId: 'budget1', metadataPath: 'data/dir1/metadata.json' },
        'Skipping local budget cache candidate due to unreadable metadata.',
      );
    });

    it('should log error when reading retry cache directories fails', async () => {
      const downloadError = new Error('Download failed');
      const readDirsError = new Error('Unable to read data directory');
      vi.mocked(downloadBudget).mockRejectedValueOnce(downloadError).mockResolvedValue(undefined);
      vi.mocked(readdir).mockRejectedValue(readDirsError);

      await sync();

      expect(logger.error).toHaveBeenCalledWith(
        { err: readDirsError, budgetId: 'budget1' },
        'Error while removing local cache for budget budget1',
      );
    });

    it('should log shutdown errors during retry reset and continue syncing', async () => {
      const downloadError = new Error('Download failed');
      const shutdownError = new Error('Retry shutdown failed');
      vi.mocked(downloadBudget).mockRejectedValueOnce(downloadError).mockResolvedValue(undefined);
      vi.mocked(shutdown)
        .mockRejectedValueOnce(shutdownError)
        .mockResolvedValue(undefined as never);

      await sync();

      expect(logger.error).toHaveBeenCalledWith(
        { err: shutdownError, budgetId: 'budget1' },
        'Error shutting down API during retry reset.',
      );
      expect(downloadBudget).toHaveBeenCalledTimes(3);
    });

    it('should handle directory creation errors', async () => {
      const error = new Error('Permission denied');
      vi.mocked(mkdir).mockRejectedValue(error);

      await sync();
      expect(shutdown).toHaveBeenCalled();
    });

    it('should handle Actual API initialization errors', async () => {
      const error = new Error('Connection failed');
      vi.mocked(init).mockRejectedValue(error);

      await sync();
      expect(shutdown).toHaveBeenCalled();
    });

    it('should handle getSyncIdMaps errors', async () => {
      const error = new Error('Failed to read metadata');
      vi.mocked(readFile).mockRejectedValue(error);

      // The function should complete even with errors
      await sync();

      // Should still attempt shutdown
      expect(shutdown).toHaveBeenCalled();
    });

    it('should handle cronstrue formatting errors gracefully', async () => {
      const error = new Error('Invalid cron expression');
      cronstrueMock.toString.mockImplementation(() => {
        throw error;
      });

      await sync();

      // Should continue with the sync process despite cron formatting error
      expect(init).toHaveBeenCalled();
      expect(shutdown).toHaveBeenCalled();
    });

    it('should log shutdown errors without throwing', async () => {
      const error = new Error('Shutdown failed');
      vi.mocked(shutdown).mockRejectedValueOnce(error);

      await expect(sync()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Error shutting down the service.');
    });
  });
});
