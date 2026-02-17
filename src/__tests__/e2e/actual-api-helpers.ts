import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import * as api from '@actual-app/api';

/**
 * Upload a budget to the server using the internal API.
 * This assigns a groupId (sync ID) to the budget.
 */
export async function uploadBudget(budgetId?: string): Promise<void> {
  const { internal } = api as {
    internal?: { send: (method: string, args: object) => Promise<unknown> };
  };
  if (!internal) {
    throw new Error('Internal API not available - make sure @actual-app/api is initialized');
  }

  console.log('Uploading budget to server...');
  const args = budgetId ? { id: budgetId } : {};
  const result = (await internal.send('upload-budget', args)) as { error?: { reason: string } };

  if (result?.error) {
    throw new Error(`Failed to upload budget: ${result.error.reason}`);
  }
  console.log('Budget uploaded successfully');
}

/**
 * List subdirectories in a directory.
 * Mirror of listSubDirectories() from src/utils.ts
 */
export async function listSubDirectories(directory: string): Promise<string[]> {
  const subDirectories = await readdir(directory, { withFileTypes: true });
  return subDirectories.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
}

/**
 * Get sync ID to budget ID mapping by reading metadata.json files.
 * Mirror of getSyncIdMaps() from src/utils.ts.
 */
export async function getSyncIdMaps(dataDir: string): Promise<Record<string, string>> {
  console.log('Getting sync id to budget id map...');
  try {
    const directories = await listSubDirectories(dataDir);
    const syncIdToBudgetId: Record<string, string> = {};

    const tasks = directories.map(async (subDir) => {
      const metadataPath = join(dataDir, subDir, 'metadata.json');
      try {
        const metadataContent = await readFile(metadataPath, 'utf8');
        let metadata;
        try {
          metadata = JSON.parse(metadataContent);
        } catch (parseError) {
          console.log(
            `  Skipping ${subDir}: invalid JSON in ${metadataPath} (${parseError instanceof Error ? parseError.message : parseError})`,
          );
          return;
        }
        syncIdToBudgetId[metadata.groupId] = metadata.id;
        console.log(`  Found mapping: syncId=${metadata.groupId} -> budgetId=${metadata.id}`);
      } catch (error) {
        console.log(
          `  Skipping ${subDir}: ${error instanceof Error ? error.message : 'no valid metadata.json'}`,
        );
      }
    });

    await Promise.all(tasks);
    console.log(
      `Sync id to budget id map created: ${Object.keys(syncIdToBudgetId).length} entries`,
    );
    return syncIdToBudgetId;
  } catch (error) {
    console.error('Error creating map from sync id to budget id:', error);
    throw error;
  }
}

/**
 * Simulate the syncAllAccounts function from src/utils.ts.
 */
export async function syncAllAccounts(): Promise<void> {
  console.log('Syncing all accounts...');
  await api.runBankSync();
  console.log('All accounts synced.');
  console.log('Syncing budget to server...');
  await api.sync();
  console.log('Budget synced to server successfully.');
}

/**
 * Interface for budget metadata stored in metadata.json.
 */
export interface BudgetMetadata {
  id: string;
  groupId: string;
  name?: string;
}

/**
 * Read metadata.json from a downloaded budget directory.
 */
export async function readBudgetMetadata(
  dataDir: string,
  budgetDirName: string,
): Promise<BudgetMetadata> {
  const metadataPath = join(dataDir, budgetDirName, 'metadata.json');
  const content = await readFile(metadataPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Link an account to SimpleFIN using the internal API.
 */
export async function linkAccountToSimpleFin(
  accountId: string,
  simpleFinAccountId: string,
  institution: string,
  orgDomain: string,
  orgId?: string,
  balance = 0,
  accountName?: string,
): Promise<void> {
  const { internal } = api as {
    internal?: { send: (method: string, args: object) => Promise<unknown> };
  };
  if (!internal) {
    throw new Error('Internal API not available - make sure @actual-app/api is initialized');
  }

  await internal.send('simplefin-accounts-link', {
    externalAccount: {
      account_id: simpleFinAccountId,
      name: accountName || `SimpleFIN Account ${simpleFinAccountId}`,
      balance,
      institution,
      orgDomain,
      orgId,
    },
    upgradingId: accountId,
    offBudget: false,
  });
}

/**
 * Set SimpleFIN credentials using the internal API.
 */
export async function setSimpleFinCredentials(accessKey: string): Promise<void> {
  const { internal } = api as {
    internal?: { send: (method: string, args: object) => Promise<unknown> };
  };
  if (!internal) {
    throw new Error('Internal API not available - make sure @actual-app/api is initialized');
  }

  await internal.send('secret-set', {
    name: 'simplefin_accessKey',
    value: accessKey,
  });
}

/**
 * Check SimpleFIN status using the internal API.
 */
export async function checkSimpleFinStatus(): Promise<{ configured: boolean }> {
  const { internal } = api as {
    internal?: { send: (method: string, args: object) => Promise<unknown> };
  };
  if (!internal) {
    throw new Error('Internal API not available - make sure @actual-app/api is initialized');
  }

  return (await internal.send('simplefin-status', {})) as { configured: boolean };
}

/**
 * Get SimpleFIN accounts using the internal API.
 */
export async function getSimpleFinAccounts(): Promise<{
  accounts: {
    id: string;
    name: string;
    balance: number;
    org: { id: string; name: string; domain: string };
  }[];
}> {
  const { internal } = api as {
    internal?: { send: (method: string, args: object) => Promise<unknown> };
  };
  if (!internal) {
    throw new Error('Internal API not available - make sure @actual-app/api is initialized');
  }

  const raw = (await internal.send('simplefin-accounts', {})) as {
    accounts?: unknown;
    data?: { accounts?: unknown };
  };

  const directAccounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  const nestedAccounts =
    directAccounts.length === 0 && Array.isArray(raw.data?.accounts) ? raw.data.accounts : [];
  const accounts = (directAccounts.length > 0 ? directAccounts : nestedAccounts) as {
    id: string;
    name: string;
    balance: number;
    org: { id: string; name: string; domain: string };
  }[];

  return { accounts };
}
