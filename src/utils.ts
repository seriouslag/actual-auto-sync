import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  downloadBudget,
  init,
  internal,
  loadBudget,
  runBankSync,
  shutdown,
  sync as syncBudget,
} from '@actual-app/api';
import cronstrue from 'cronstrue';

import { env } from './env.js';
import { logger } from './logger.js';

const ACTUAL_DATA_DIR = './data';

export function formatCronSchedule(schedule: string) {
  return cronstrue.toString(schedule).toLowerCase();
}

export async function syncAccountBalancesToCRDT() {
  try {
    const accounts = (await internal.db.getAccounts()) as {
      id: string;
      balance_current?: number;
    }[];

    for (const account of accounts) {
      if (typeof account.balance_current === 'number') {
        await internal.db.update('accounts', {
          id: account.id,
          balance_current: account.balance_current,
        });
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error syncing account balances through CRDT');
  }
}

async function syncBankAccounts() {
  logger.info('Syncing all accounts...');
  await runBankSync();
  logger.info('All accounts synced.');
  logger.info('Syncing account balances through CRDT...');
  await syncAccountBalancesToCRDT();
  logger.info('Account balances synced through CRDT.');
}

async function syncBudgetToServer() {
  logger.info('Syncing budget to server...');
  await syncBudget();
  logger.info('Budget synced to server successfully.');
}

export async function syncAllAccounts() {
  try {
    await syncBankAccounts();
    await syncBudgetToServer();
  } catch (error) {
    logger.error({ error }, 'Error syncing all accounts');
  }
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
    logger.error({ error }, 'Error initializing Actual API.');
    throw error;
  }
}

async function loadConfiguredBudgets(syncIdToBudgetId: Record<string, string>) {
  const configuredSyncIds = new Set(env.ACTUAL_BUDGET_SYNC_IDS);

  for (const [syncId, budgetId] of Object.entries(syncIdToBudgetId)) {
    if (configuredSyncIds.has(syncId)) {
      logger.info(`Sync id: ${syncId}, Budget id: ${budgetId}`);
      try {
        logger.info(`Loading budget ${budgetId}...`);
        await loadBudget(budgetId);
        logger.info(`Budget ${budgetId} loaded successfully.`);
      } catch (error) {
        logger.error({ error }, `Error loading budget ${budgetId}`);
      }
    } else {
      logger.info(`Sync id ${syncId} not in ACTUAL_BUDGET_SYNC_IDS, skipping...`);
    }
  }
}

async function downloadConfiguredBudgets() {
  for (const [index, budgetId] of env.ACTUAL_BUDGET_SYNC_IDS.entries()) {
    try {
      logger.info(`Downloading budget ${budgetId}...`);
      const password = env.ENCRYPTION_PASSWORDS[index];
      if (password) {
        await downloadBudget(budgetId, { password });
      } else {
        await downloadBudget(budgetId);
      }
      logger.info(`Budget ${budgetId} downloaded successfully.`);
    } catch (error) {
      logger.error({ error }, `Error downloading budget ${budgetId}`);
    }
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
    logger.error({ error }, 'Error creating map from sync id to budget id');
    throw error;
  }
}

async function runSyncCycle() {
  try {
    await createDataDirAndInitApi();

    logger.info(`Scheduling sync to run ${formatCronSchedule(env.CRON_SCHEDULE)}...`);

    const syncIdToBudgetId = await getSyncIdMaps(ACTUAL_DATA_DIR);
    await loadConfiguredBudgets(syncIdToBudgetId);
    await downloadConfiguredBudgets();

    logger.info('Syncing accounts...');
    await syncAllAccounts();
    logger.info('Accounts synced successfully.');
  } catch (error) {
    logger.error({ error }, 'Error starting the service.');
  }
}

async function shutdownApi() {
  logger.info('Shutting down...');
  await shutdown();
  logger.info('Shutdown complete.');
}

export const sync = async () => {
  logger.info('Starting service...');
  try {
    await runSyncCycle();
  } finally {
    try {
      await shutdownApi();
    } catch (error) {
      logger.error({ error }, 'Error shutting down the service.');
    }
  }
};
