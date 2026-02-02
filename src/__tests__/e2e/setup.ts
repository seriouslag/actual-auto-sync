import * as api from '@actual-app/api';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// E2E test configuration - uses environment variables or defaults
export const E2E_CONFIG = {
  serverUrl: process.env.ACTUAL_SERVER_URL || 'http://localhost:5006',
  serverPassword: process.env.ACTUAL_SERVER_PASSWORD || 'test-password-e2e',
  dataDir: process.env.ACTUAL_DATA_DIR || './e2e-data',
};

/**
 * Check if the server needs to be bootstrapped (first-time setup)
 */
export async function needsBootstrap(): Promise<boolean> {
  try {
    const response = await fetch(`${E2E_CONFIG.serverUrl}/account/needs-bootstrap`);
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok' && data.data?.bootstrapped === false;
    }
  } catch {
    // If endpoint doesn't exist or fails, assume no bootstrap needed
  }
  return false;
}

/**
 * Bootstrap the server with initial password (first-time setup)
 */
export async function bootstrapServer(): Promise<void> {
  console.log('Bootstrapping server with initial password...');

  const response = await fetch(`${E2E_CONFIG.serverUrl}/account/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: E2E_CONFIG.serverPassword }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to bootstrap server: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (data.status !== 'ok') {
    throw new Error(`Bootstrap failed: ${JSON.stringify(data)}`);
  }

  console.log('Server bootstrapped successfully');
}

/**
 * Wait for the Actual Budget server to be ready
 */
export async function waitForServer(maxAttempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${E2E_CONFIG.serverUrl}/`);
      if (response.ok) {
        console.log(`Server ready after ${attempt} attempt(s)`);

        // Check if server needs bootstrapping
        if (await needsBootstrap()) {
          await bootstrapServer();
        }

        return;
      }
    } catch {
      // Server not ready yet
    }

    if (attempt < maxAttempts) {
      console.log(`Waiting for server... attempt ${attempt}/${maxAttempts}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Server at ${E2E_CONFIG.serverUrl} not ready after ${maxAttempts} attempts`);
}

/**
 * Initialize the Actual API connection
 */
export async function initApi(): Promise<void> {
  await mkdir(E2E_CONFIG.dataDir, { recursive: true });

  await api.init({
    dataDir: E2E_CONFIG.dataDir,
    serverURL: E2E_CONFIG.serverUrl,
    password: E2E_CONFIG.serverPassword,
  });
}

/**
 * Clean up the API connection
 */
export async function shutdownApi(): Promise<void> {
  try {
    await api.shutdown();
  } catch {
    // Ignore shutdown errors in cleanup
  }
}

/**
 * Clean up e2e data directory
 */
export async function cleanupDataDir(): Promise<void> {
  try {
    await rm(E2E_CONFIG.dataDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Sample transaction data for testing
 */
export function createSampleTransactions(count = 5) {
  const transactions = [];
  const today = new Date();
  const timestamp = Date.now();

  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    transactions.push({
      date: dateStr,
      amount: -((i + 1) * 1000), // Negative = expense, in cents
      payee_name: `Test Payee ${i + 1}`,
      notes: `E2E test transaction ${i + 1}`,
      imported_id: `e2e-test-${timestamp}-${i}`,
    });
  }

  return transactions;
}

/**
 * Create a test budget with sample data using runImport.
 * This seeds the server with a budget that can then be downloaded by sync ID.
 * Returns the budget's sync ID (groupId) which is what the actual-auto-sync app uses.
 *
 * The sync ID is obtained from the local metadata.json file after runImport,
 * where groupId is the sync ID (server identifier) used by downloadBudget().
 */
export async function seedTestBudget(): Promise<{
  budgetName: string;
  syncId: string | undefined; // undefined if upload failed
  budgetId: string; // local budget ID
  accountId: string;
  uploadedToServer: boolean;
}> {
  const budgetName = `e2e-sync-test-${Date.now()}`;

  console.log(`Seeding test budget: ${budgetName}`);

  let createdAccountId = '';

  await api.runImport(budgetName, async () => {
    // Create a checking account with initial balance
    createdAccountId = await api.createAccount(
      {
        name: 'E2E Test Checking',
      },
      10_000 * 100, // $10,000 initial balance in cents
    );

    console.log(`Created account: ${createdAccountId}`);

    // Add sample transactions
    const transactions = createSampleTransactions(5);
    const transactionIds = await api.addTransactions(createdAccountId, transactions);
    console.log(`Added ${transactionIds.length} transactions`);
  });

  // Try to upload budget to server to get a sync ID (groupId)
  // This may fail in some environments (e.g., backup directory issues)
  let uploadSucceeded = false;
  try {
    await uploadBudget();
    console.log('Budget uploaded to server');
    uploadSucceeded = true;
  } catch (error) {
    console.log('Budget upload failed (budget will be local-only):', error);
  }

  // Sync to ensure all data is on server (only if upload succeeded)
  if (uploadSucceeded) {
    await api.sync();
  }

  // Get the sync ID from the local metadata.json file
  // After runImport, the budget is stored locally and metadata.json contains:
  // - id: the local budget ID
  // - groupId: the sync ID (server identifier) used by downloadBudget()
  const directories = await listSubDirectories(E2E_CONFIG.dataDir);
  const budgetDir = directories.find((d) => d.startsWith(budgetName));

  if (!budgetDir) {
    throw new Error(`Failed to find seeded budget directory for: ${budgetName}`);
  }

  const metadata = await readBudgetMetadata(E2E_CONFIG.dataDir, budgetDir);
  console.log(`Seeded budget: localId=${metadata.id}, syncId(groupId)=${metadata.groupId}`);

  return {
    budgetName,
    syncId: metadata.groupId, // This is the UUID sync ID used by downloadBudget (undefined if upload failed)
    budgetId: metadata.id, // Local budget ID
    accountId: createdAccountId,
    uploadedToServer: uploadSucceeded,
  };
}

// ============================================================================
// Functions that mirror the actual application (from src/utils.ts)
// These are used to test the real sync workflow
// ============================================================================

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
 * Mirror of getSyncIdMaps() from src/utils.ts
 *
 * This is the workaround the app uses because the Actual API doesn't provide
 * a direct way to get the budget ID from the sync ID.
 */
export async function getSyncIdMaps(dataDir: string): Promise<Record<string, string>> {
  console.log('Getting sync id to budget id map...');
  try {
    const directories = await listSubDirectories(dataDir);
    const syncIdToBudgetId: Record<string, string> = {};

    const tasks = directories.map(async (subDir) => {
      try {
        const metadataPath = join(dataDir, subDir, 'metadata.json');
        const metadataContent = await readFile(metadataPath, 'utf8');
        const metadata = JSON.parse(metadataContent);
        // GroupId is the sync ID, id is the budget ID
        syncIdToBudgetId[metadata.groupId] = metadata.id;
        console.log(`  Found mapping: syncId=${metadata.groupId} -> budgetId=${metadata.id}`);
      } catch {
        // Skip directories without metadata.json
        console.log(`  Skipping ${subDir}: no valid metadata.json`);
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
 * Simulate the syncAllAccounts function from src/utils.ts
 * This is what the app does after loading a budget.
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
 * Interface for budget metadata stored in metadata.json
 */
export interface BudgetMetadata {
  id: string; // Budget ID (local identifier)
  groupId: string; // Sync ID (server identifier)
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

// ============================================================================
// SimpleFIN Mock Server Helpers
// These are used for testing bank sync with a mock SimpleFIN server
// ============================================================================

export {
  // Server functions
  createMockSimpleFinServer,
  startMockSimpleFinServer,
  stopMockSimpleFinServer,
  // Fixture functions
  addTestAccount as addMockSimpleFinAccount,
  addTestTransactions as addMockSimpleFinTransactions,
  createMockAccount,
  createMockTransaction,
  daysAgo,
  getAllAccounts as getMockSimpleFinAccounts,
  getAccountById as getMockSimpleFinAccountById,
  resetFixtures as resetMockSimpleFinFixtures,
  // Data
  accounts as mockSimpleFinAccounts,
  transactions as mockSimpleFinTransactions,
  // Types
  type MockAccount,
  type MockSimpleFinConfig,
  type MockTransaction,
} from './mock-simplefin/index.js';

/**
 * Configuration for mock SimpleFIN server
 */
export const MOCK_SIMPLEFIN_CONFIG = {
  port: Number(process.env.MOCK_SIMPLEFIN_PORT) || 8080,
  username: process.env.MOCK_SIMPLEFIN_USERNAME || 'test',
  password: process.env.MOCK_SIMPLEFIN_PASSWORD || 'test123',
};

// ============================================================================
// Real SimpleFIN Token Helpers
// These are used for testing with real SimpleFIN tokens (beta/demo accounts)
// ============================================================================

/**
 * Fetch a fresh demo token from the SimpleFIN developer page.
 * Each page load generates a new unique demo token.
 *
 * @returns A fresh setup token (base64-encoded claim URL)
 */
export async function fetchFreshSimpleFinToken(): Promise<string> {
  console.log('Fetching fresh SimpleFIN demo token...');

  const response = await fetch('https://beta-bridge.simplefin.org/info/developers');
  if (!response.ok) {
    throw new Error(`Failed to fetch SimpleFIN developer page: ${response.status}`);
  }

  const html = await response.text();

  // Look for base64-encoded tokens that decode to SimpleFIN claim URLs
  // Pattern: starts with aHR0 (base64 for "http") and contains claim URL pattern
  const tokenPattern = /aHR0[A-Za-z0-9+/]+=*/g;
  const matches = html.match(tokenPattern);

  if (!matches || matches.length === 0) {
    throw new Error('No SimpleFIN demo tokens found on developer page');
  }

  // Find tokens that decode to valid claim URLs
  for (const match of matches) {
    try {
      const decoded = Buffer.from(match, 'base64').toString('utf8');
      if (decoded.includes('simplefin/claim/DEMO')) {
        console.log(`Found fresh demo token: ${match.slice(0, 20)}...`);
        return match;
      }
    } catch {
      // Skip invalid base64
    }
  }

  throw new Error('No valid SimpleFIN demo claim tokens found');
}

/**
 * Fetch multiple fresh demo tokens from SimpleFIN.
 * Makes multiple requests to get unique tokens for each budget.
 *
 * @param count - Number of tokens to fetch
 * @returns Array of fresh setup tokens
 */
export async function fetchMultipleFreshTokens(count: number): Promise<string[]> {
  const tokens: string[] = [];

  for (let i = 0; i < count; i++) {
    // Add a small delay between requests to ensure unique tokens
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const token = await fetchFreshSimpleFinToken();
    tokens.push(token);
    console.log(`Fetched token ${i + 1}/${count}`);
  }

  return tokens;
}

/**
 * Claim a SimpleFIN setup token and exchange it for an access key.
 *
 * SimpleFIN uses a two-step authentication process:
 * 1. Setup Token: A base64-encoded claim URL
 * 2. Access Key: Obtained by POSTing to the claim URL - contains credentials for API access
 *
 * The setup token can only be claimed once. After claiming, it becomes invalid.
 *
 * @param setupToken - The base64-encoded setup token (from SimpleFIN developer portal)
 * @returns The access key URL (https://username:password@bridge.simplefin.org/)
 */
export async function claimSimpleFinToken(setupToken: string): Promise<string> {
  // Decode the setup token to get the claim URL
  const claimUrl = Buffer.from(setupToken, 'base64').toString('utf8');
  console.log(`Claiming SimpleFIN token from: ${claimUrl}`);

  // POST to the claim URL to get the access key
  const response = await fetch(claimUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to claim SimpleFIN token: ${response.status} ${text}`);
  }

  const accessKey = await response.text();
  console.log('SimpleFIN token claimed successfully');
  return accessKey.trim();
}

/**
 * Configuration for real SimpleFIN test tokens
 */
export interface SimpleFinTokenConfig {
  /** The setup token (base64-encoded claim URL) */
  setupToken: string;
  /** Optional: Pre-claimed access key (if already claimed) */
  accessKey?: string;
}

/**
 * Fetch available accounts from SimpleFIN using an access key.
 * This is useful for discovering what accounts are available before linking.
 *
 * @param accessKey - The SimpleFIN access key URL
 * @returns List of available SimpleFIN accounts
 */
export async function fetchSimpleFinAccountsWithAccessKey(accessKey: string): Promise<{
  accounts: {
    id: string;
    name: string;
    balance: string;
    'available-balance'?: string;
    currency: string;
    org: {
      id: string;
      name: string;
      domain: string | null;
    };
  }[];
}> {
  // Parse credentials from access key URL
  // Format: https://username:password@host/simplefin/
  const url = new URL(accessKey);
  const username = url.username;
  const password = url.password;

  // Build base URL preserving the path (e.g., /simplefin/)
  // Remove trailing slash to avoid double slashes
  const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const baseUrl = `${url.protocol}//${url.host}${basePath}`;

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`Fetching SimpleFIN accounts from: ${url.protocol}//${url.host}${basePath}/accounts`);

  const response = await fetch(`${baseUrl}/accounts?balances-only=1`, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch SimpleFIN accounts: ${response.status} ${text.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Setup SimpleFIN for a budget with a given access key.
 * This sets the SimpleFIN credentials and optionally links accounts.
 *
 * @param accessKey - The SimpleFIN access key URL
 */
export async function setupSimpleFinForBudget(accessKey: string): Promise<void> {
  console.log('Setting up SimpleFIN for budget...');
  await setSimpleFinCredentials(accessKey);
  console.log('SimpleFIN credentials set successfully');
}

/**
 * Create a test budget with a linked SimpleFIN account.
 * This is a higher-level helper that:
 * 1. Creates a budget with runImport
 * 2. Sets SimpleFIN credentials
 * 3. Links an account to SimpleFIN
 *
 * @param budgetName - Name for the test budget
 * @param accessKey - SimpleFIN access key
 * @param simpleFinAccountId - SimpleFIN account ID to link
 * @param simpleFinAccountName - SimpleFIN account name
 * @param institution - Bank/institution name
 * @param orgDomain - Organization domain
 * @returns Budget info including syncId and accountId
 */
export async function createBudgetWithSimpleFin(
  budgetName: string,
  accessKey: string,
  simpleFinAccountId: string,
  simpleFinAccountName: string,
  institution: string,
  orgDomain: string,
): Promise<{
  budgetName: string;
  syncId: string;
  accountId: string;
}> {
  console.log(
    `Creating budget "${budgetName}" with SimpleFIN account "${simpleFinAccountName}"...`,
  );

  let createdAccountId = '';

  await api.runImport(budgetName, async () => {
    // Create an account that will be linked to SimpleFIN
    createdAccountId = await api.createAccount(
      {
        name: simpleFinAccountName,
      },
      0, // Initial balance will come from SimpleFIN
    );
    console.log(`Created account: ${createdAccountId}`);
  });

  // Upload budget to server to get a sync ID (groupId)
  await uploadBudget();

  // Sync to ensure server has the data
  await api.sync();

  // Get the sync ID from local metadata
  const directories = await listSubDirectories(E2E_CONFIG.dataDir);
  const budgetDir = directories.find((d) => d.startsWith(budgetName));

  if (!budgetDir) {
    throw new Error(`Failed to find seeded budget directory for: ${budgetName}`);
  }

  const metadata = await readBudgetMetadata(E2E_CONFIG.dataDir, budgetDir);
  console.log(`Created budget: localId=${metadata.id}, syncId=${metadata.groupId}`);

  // Set SimpleFIN credentials for this budget
  await setSimpleFinCredentials(accessKey);
  console.log('SimpleFIN credentials set');

  // Link the account to SimpleFIN
  await linkAccountToSimpleFin(createdAccountId, simpleFinAccountId, institution, orgDomain);
  console.log(`Linked account ${createdAccountId} to SimpleFIN account ${simpleFinAccountId}`);

  return {
    budgetName,
    syncId: metadata.groupId,
    accountId: createdAccountId,
  };
}

/**
 * Get the mock SimpleFIN access key URL
 */
export function getMockSimpleFinAccessKey(host = 'localhost'): string {
  const { port, username, password } = MOCK_SIMPLEFIN_CONFIG;
  return `http://${username}:${password}@${host}:${port}/`;
}

/**
 * Link an account to SimpleFIN using the internal API.
 * Note: This requires the budget to be loaded first.
 */
export async function linkAccountToSimpleFin(
  accountId: string,
  simpleFinAccountId: string,
  institution: string,
  orgDomain: string,
): Promise<void> {
  // Use the internal API to link the account
  const { internal } = api as {
    internal?: { send: (method: string, args: object) => Promise<unknown> };
  };
  if (!internal) {
    throw new Error('Internal API not available - make sure @actual-app/api is initialized');
  }

  await internal.send('simplefin-accounts-link', {
    externalAccount: {
      account_id: simpleFinAccountId,
      name: `SimpleFIN Account ${simpleFinAccountId}`,
      balance: 0,
      institution,
      orgDomain,
    },
    upgradingId: accountId,
    offBudget: false,
  });
}

/**
 * Set SimpleFIN credentials using the internal API.
 * Note: This requires the server to be running.
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
 * Upload a budget to the server using the internal API.
 * This assigns a groupId (sync ID) to the budget.
 *
 * After runImport creates a local budget, call this to upload it to the server.
 * This is necessary for the budget to have a sync ID for downloading later.
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

  return (await internal.send('simplefin-accounts', {})) as {
    accounts: {
      id: string;
      name: string;
      balance: number;
      org: { id: string; name: string; domain: string };
    }[];
  };
}
