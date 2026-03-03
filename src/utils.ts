import { existsSync, type Dirent } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  downloadBudget,
  init,
  internal,
  runBankSync,
  shutdown,
  sync as syncBudget,
} from '@actual-app/api';
import cronstrue from 'cronstrue';

import { env } from './env.js';
import { logger } from './logger.js';

const DEFAULT_ACTUAL_DATA_DIR = existsSync('/.dockerenv') ? '/data' : './data';
const ACTUAL_DATA_DIR = env.ACTUAL_DATA_DIR ?? DEFAULT_ACTUAL_DATA_DIR;

if (env.ACTUAL_DATA_DIR) {
  logger.warn(
    { actualDataDir: env.ACTUAL_DATA_DIR },
    'ACTUAL_DATA_DIR is deprecated and will be removed in the next major release. Use /data in containers and mount it with tmpfs or a volume.',
  );
}
// Keep retries small to avoid long loops while still healing transient API/session issues.
const MAX_BUDGET_SYNC_ATTEMPTS = 2;

export function formatCronSchedule(schedule: string) {
  return cronstrue.toString(schedule).toLowerCase();
}

interface AccountBalanceRow {
  id: string;
  balance_current?: number | null;
}
interface AccountBalanceSyncInput {
  accounts: AccountBalanceRow[];
  readFailed: boolean;
}

async function getAccountsForBalanceSync(): Promise<AccountBalanceSyncInput> {
  try {
    return {
      accounts: (await internal.db.getAccounts()) as AccountBalanceRow[],
      readFailed: false,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error syncing account balances through CRDT');
    return {
      accounts: [],
      readFailed: true,
    };
  }
}

async function syncAccountBalanceToCRDT(account: AccountBalanceRow): Promise<boolean> {
  try {
    await internal.db.update('accounts', {
      id: account.id,
      balance_current: account.balance_current,
    });
    return true;
  } catch (error) {
    logger.error(
      { err: error, accountId: account.id },
      'Error syncing account balance through CRDT for account',
    );
    return false;
  }
}

/** Persists current numeric account balances via CRDT row updates for the loaded budget. */
export async function syncAccountBalancesToCRDT() {
  const { accounts, readFailed } = await getAccountsForBalanceSync();
  if (readFailed) {
    return false;
  }

  let hasSyncErrors = false;
  for (const account of accounts) {
    if (typeof account.balance_current === 'number') {
      const synced = await syncAccountBalanceToCRDT(account);
      if (!synced) {
        hasSyncErrors = true;
      }
    }
  }

  return !hasSyncErrors;
}

async function syncBankAccounts() {
  logger.info('Syncing all accounts...');
  await runBankSync();
  logger.info('All accounts synced.');
  logger.info('Syncing account balances through CRDT...');
  const syncedBalances = await syncAccountBalancesToCRDT();
  if (syncedBalances) {
    logger.info('Account balances synced through CRDT.');
  } else {
    logger.info('Account balances sync through CRDT completed with errors.');
  }
}

async function syncBudgetToServer() {
  logger.info('Syncing budget to server...');
  await syncBudget();
  logger.info('Budget synced to server successfully.');
}

/** Runs bank sync, then pushes synced balance state to the server for the loaded budget. */
export async function syncAllAccounts() {
  // Runs against the currently loaded budget in the Actual API session.
  await syncBankAccounts();
  await syncBudgetToServer();
}

async function createDataDirAndInitApi() {
  try {
    logger.info(`Creating data directory ${ACTUAL_DATA_DIR}`);
    await mkdir(ACTUAL_DATA_DIR, { recursive: true });
    logger.info('Data directory created successfully.');
    logger.info('Initializing Actual API...');
    await init({
      dataDir: ACTUAL_DATA_DIR,
      serverURL: env.ACTUAL_SERVER_URL,
      password: env.ACTUAL_SERVER_PASSWORD,
    });
    logger.info('Actual API initialized successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Error initializing Actual API.');
    throw error;
  }
}

interface LocalBudgetMetadata {
  groupId?: string;
}

async function maybeRemoveLocalBudgetCacheBySyncId(
  syncId: string,
  directory: Dirent,
): Promise<boolean> {
  if (!directory.isDirectory()) {
    return false;
  }
  const metadataPath = join(ACTUAL_DATA_DIR, directory.name, 'metadata.json');
  try {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as LocalBudgetMetadata;
    if (metadata.groupId !== syncId) {
      logger.debug(
        { budgetId: syncId, metadataPath, metadataGroupId: metadata.groupId },
        'Local budget metadata does not match sync ID during cache scan.',
      );
      return false;
    }
    const budgetDirectoryPath = join(ACTUAL_DATA_DIR, directory.name);
    logger.info(`Removing local cache for budget ${syncId} at ${budgetDirectoryPath}...`);
    await rm(budgetDirectoryPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    logger.debug(
      { err: error, budgetId: syncId, metadataPath },
      'Skipping local budget cache candidate due to unreadable metadata.',
    );
    return false;
  }
}

async function removeLocalBudgetCacheBySyncId(syncId: string) {
  try {
    const directories = await readdir(ACTUAL_DATA_DIR, { withFileTypes: true });
    for (const directory of directories) {
      const removed = await maybeRemoveLocalBudgetCacheBySyncId(syncId, directory);
      if (removed) {
        return;
      }
    }
    logger.warn(
      { budgetId: syncId },
      `No local cache found for budget ${syncId}; retrying without deleting cache.`,
    );
  } catch (error) {
    logger.error(
      { err: error, budgetId: syncId },
      `Error while removing local cache for budget ${syncId}`,
    );
  }
}

/** Rebuilds the Actual API session and clears stale local cache before retrying a budget. */
async function resetApiSessionForRetry(syncId: string) {
  logger.info(`Resetting Actual API session before retrying budget ${syncId}...`);
  try {
    await shutdown();
  } catch (error) {
    logger.error({ err: error, budgetId: syncId }, 'Error shutting down API during retry reset.');
  }
  // If local metadata/cache is stale for this sync ID, remove it before retrying.
  await removeLocalBudgetCacheBySyncId(syncId);
  await createDataDirAndInitApi();
}

/** Executes one budget sync with bounded retries and optional encryption password by index. */
async function downloadAndSyncBudget(budgetId: string, index: number) {
  const password = env.ENCRYPTION_PASSWORDS[index];

  // Each attempt runs full download -> bank sync -> push to server for one budget.
  for (let attempt = 1; attempt <= MAX_BUDGET_SYNC_ATTEMPTS; attempt++) {
    try {
      logger.info(
        `Downloading budget ${budgetId} (attempt ${attempt}/${MAX_BUDGET_SYNC_ATTEMPTS})...`,
      );
      if (password) {
        await downloadBudget(budgetId, { password });
      } else {
        await downloadBudget(budgetId);
      }
      logger.info(`Budget ${budgetId} downloaded successfully.`);

      logger.info(`Syncing accounts for budget ${budgetId}...`);
      await syncAllAccounts();
      logger.info(`Accounts synced successfully for budget ${budgetId}.`);
      return;
    } catch (error) {
      logger.error({ err: error, budgetId, attempt }, `Error syncing budget ${budgetId}`);
      if (attempt === MAX_BUDGET_SYNC_ATTEMPTS) {
        throw error;
      }
      logger.warn(
        { budgetId, attempt, nextAttempt: attempt + 1 },
        `Retrying budget ${budgetId} sync after failure.`,
      );
      await resetApiSessionForRetry(budgetId);
    }
  }
}

/** Sequentially syncs all configured budget sync IDs and throws a summary on partial failure. */
async function downloadConfiguredBudgets() {
  const failedBudgets: string[] = [];

  // Process budgets sequentially to avoid overlapping Actual API state transitions.
  for (const [index, budgetId] of env.ACTUAL_BUDGET_SYNC_IDS.entries()) {
    try {
      await downloadAndSyncBudget(budgetId, index);
    } catch (error) {
      // Keep going so one failing budget does not block the rest.
      failedBudgets.push(budgetId);
      logger.error({ err: error }, `Failed to sync budget ${budgetId} after retries.`);
    }
  }

  if (failedBudgets.length > 0) {
    throw new Error(`Failed to sync budget(s): ${failedBudgets.join(', ')}`);
  }
}

export async function listSubDirectories(directory: string) {
  const subDirectories = await readdir(directory, { withFileTypes: true });
  return subDirectories.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
}

export async function getSyncIdMaps(dataDir: string) {
  logger.info('Getting sync id to budget id map...');
  // Unfortunately Actual Node.js api doesn't provide functionality to get the
  // Budget id associated to the sync id, this is a hack to do that
  try {
    const directories = await listSubDirectories(dataDir);
    const syncIdToBudgetId: Record<string, string> = {};
    const tasks = directories.map(async (subDir) => {
      const metadata = JSON.parse(await readFile(join(dataDir, subDir, 'metadata.json'), 'utf8'));
      syncIdToBudgetId[metadata.groupId] = metadata.id;
    });
    await Promise.all(tasks);
    logger.info('Sync id to budget id map created successfully.');
    return syncIdToBudgetId;
  } catch (error) {
    logger.error({ err: error }, 'Error creating map from sync id to budget id');
    throw error;
  }
}

async function runSyncCycle() {
  try {
    await createDataDirAndInitApi();

    logger.info(`Scheduling sync to run ${formatCronSchedule(env.CRON_SCHEDULE)}...`);
    // Main sync work for one cron tick.
    await downloadConfiguredBudgets();
  } catch (error) {
    logger.error({ err: error }, 'Error starting the service.');
    logger.warn('Sync cycle did not complete successfully.');
  }
}

async function shutdownApi() {
  logger.info('Shutting down...');
  await shutdown();
  logger.info('Shutdown complete.');
}

/** Entry point for one service run: init, per-budget sync cycle, and guaranteed shutdown. */
export const sync = async () => {
  logger.info('Starting service...');
  try {
    await runSyncCycle();
  } finally {
    try {
      await shutdownApi();
    } catch (error) {
      logger.error({ err: error }, 'Error shutting down the service.');
    }
  }
};
