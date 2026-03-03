// oxlint-disable max-statements
import { mkdir, rm } from 'node:fs/promises';

import * as api from '@actual-app/api';

import {
  getSimpleFinAccounts,
  linkAccountToSimpleFin,
  listSubDirectories,
  readBudgetMetadata,
  setSimpleFinCredentials,
  uploadBudget,
} from './actual-api-helpers.js';
export {
  checkSimpleFinStatus,
  getSimpleFinAccounts,
  getSyncIdMaps,
  linkAccountToSimpleFin,
  listSubDirectories,
  readBudgetMetadata,
  setSimpleFinCredentials,
  syncAllAccounts,
  uploadBudget,
} from './actual-api-helpers.js';
export type { BudgetMetadata } from './actual-api-helpers.js';

// E2E test configuration - uses environment variables or defaults
export const E2E_CONFIG = {
  serverUrl: process.env.ACTUAL_SERVER_URL || 'http://localhost:5006',
  serverPassword: process.env.ACTUAL_SERVER_PASSWORD || 'test-password-e2e',
  dataDir: process.env.E2E_DATA_DIR || './e2e-data',
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
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  throw new Error(`Server at ${E2E_CONFIG.serverUrl} not ready after ${maxAttempts} attempts`);
}

/**
 * Initialize the Actual API connection
 */
export async function initApi(): Promise<void> {
  // @actual-app/api export/upload paths read this env var directly.
  // Keep it aligned with the dataDir we initialize with so E2E runs are consistent
  // both inside and outside docker-compose.
  process.env.ACTUAL_DATA_DIR = E2E_CONFIG.dataDir;

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
    const [dateStr] = date.toISOString().split('T');

    transactions.push({
      date: dateStr,
      // Negative = expense, in cents
      amount: -((i + 1) * 1000),
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
  // Undefined if upload failed
  syncId: string | undefined;
  // Local budget ID
  budgetId: string;
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
      // $10,000 initial balance in cents
      10_000 * 100,
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

function formatUrlForSafeLogs(urlString: string): string {
  try {
    const url = new URL(urlString);
    return `${url.origin}/...`;
  } catch {
    return '[invalid-url]';
  }
}

function getSimpleFinDemoTokenCandidates(html: string): string[] {
  const candidates = new Set<string>();

  // Preferred pattern: base64-encoded URLs that decode to SimpleFIN claim endpoints.
  // This is intentionally heuristic and can break if the upstream page changes.
  const base64Pattern = /aHR0[A-Za-z0-9+/]+=*/g;
  const base64Matches = html.match(base64Pattern) ?? [];

  for (const match of base64Matches) {
    try {
      const decoded = Buffer.from(match, 'base64').toString('utf8');
      if (decoded.includes('simplefin/claim/DEMO')) {
        candidates.add(match);
      }
    } catch {
      // Skip invalid base64 fragments.
    }
  }

  // Fallback: claim URLs may be present directly in HTML in plain text.
  const claimUrlPattern = /https:\/\/[^\s"'<>]*simplefin\/claim\/DEMO[^\s"'<>]*/g;
  const claimUrlMatches = html.match(claimUrlPattern) ?? [];
  for (const claimUrl of claimUrlMatches) {
    candidates.add(Buffer.from(claimUrl, 'utf8').toString('base64'));
  }

  return [...candidates];
}

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
  const tokenCandidates = getSimpleFinDemoTokenCandidates(html);
  if (tokenCandidates.length > 0) {
    const [token] = tokenCandidates;
    console.log(`Found fresh demo token: ${token.slice(0, 20)}...`);
    return token;
  }

  throw new Error(
    'No valid SimpleFIN demo claim tokens found. The developer page format may have changed; provide SIMPLEFIN_SETUP_TOKEN_1/2 as a fallback.',
  );
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
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
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
  console.log(`Claiming SimpleFIN token from: ${formatUrlForSafeLogs(claimUrl)}`);

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

function buildSimpleFinAuthConfig(accessKey: string): { baseUrl: string; authHeader: string } {
  const url = new URL(accessKey);
  const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const baseUrl = `${url.protocol}//${url.host}${basePath}`;
  const authHeader = `Basic ${Buffer.from(`${url.username}:${url.password}`).toString('base64')}`;
  return { baseUrl, authHeader };
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
  const { baseUrl, authHeader } = buildSimpleFinAuthConfig(accessKey);
  console.log(`Fetching SimpleFIN accounts from: ${baseUrl}/accounts`);

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

  const availableSimpleFinAccounts = await getSimpleFinAccounts();
  const matchingSimpleFinAccount = availableSimpleFinAccounts.accounts.find(
    (account) => account.id === simpleFinAccountId,
  );
  const linkedSimpleFinAccount = matchingSimpleFinAccount ?? {
    id: simpleFinAccountId,
    name: simpleFinAccountName,
    balance: 0,
    org: {
      id: '',
      name: institution,
      domain: orgDomain,
    },
  };
  if (!matchingSimpleFinAccount) {
    const availableAccountIds = availableSimpleFinAccounts.accounts.map((account) => account.id);
    console.log(
      `SimpleFIN account ${simpleFinAccountId} not found from discovery. Falling back to provided metadata. Available accounts: ${availableAccountIds.join(', ') || '(none)'}`,
    );
  }

  // Link the account to SimpleFIN
  await linkAccountToSimpleFin(
    createdAccountId,
    linkedSimpleFinAccount.id,
    linkedSimpleFinAccount.org.name || institution,
    linkedSimpleFinAccount.org.domain || orgDomain,
    linkedSimpleFinAccount.org.id,
    linkedSimpleFinAccount.balance,
    linkedSimpleFinAccount.name,
  );
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
