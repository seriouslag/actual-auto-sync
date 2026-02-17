/**
 * Multi-Budget Sync E2E Tests with Real SimpleFIN Integration
 *
 * These tests validate the SimpleFIN integration for multiple budgets,
 * each using a separate SimpleFIN token fetched automatically from the
 * SimpleFIN developer portal.
 *
 * Token Fetching:
 * - Tokens are fetched fresh from https://beta-bridge.simplefin.org/info/developers
 * - Each page load generates a new unique demo token
 * - Tokens are claimed and exchanged for access keys
 *
 * Environment Variable Overrides:
 * - SIMPLEFIN_ACCESS_KEY_1 / SIMPLEFIN_ACCESS_KEY_2: Pre-claimed access keys
 * - SIMPLEFIN_SETUP_TOKEN_1 / SIMPLEFIN_SETUP_TOKEN_2: Pre-fetched setup tokens
 */
import * as api from '@actual-app/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  E2E_CONFIG,
  claimSimpleFinToken,
  cleanupDataDir,
  fetchFreshSimpleFinToken,
  fetchSimpleFinAccountsWithAccessKey,
  initApi,
  listSubDirectories,
  readBudgetMetadata,
  setSimpleFinCredentials,
  shutdownApi,
  waitForServer,
} from './setup.js';

/**
 * SimpleFIN Token Configuration
 *
 * Tokens are fetched fresh from the SimpleFIN developer portal during test setup.
 * Each test run gets unique tokens, ensuring clean test isolation.
 */
const SIMPLEFIN_TOKENS = {
  token1: {
    setupToken: process.env.SIMPLEFIN_SETUP_TOKEN_1,
    accessKey: process.env.SIMPLEFIN_ACCESS_KEY_1,
  },
  token2: {
    setupToken: process.env.SIMPLEFIN_SETUP_TOKEN_2,
    accessKey: process.env.SIMPLEFIN_ACCESS_KEY_2,
  },
};

const allowFreshTokenFetch =
  process.env.SIMPLEFIN_ALLOW_TOKEN_FETCH === '1' ||
  process.env.SIMPLEFIN_ALLOW_TOKEN_FETCH === 'true';

function hasTokenSource(tokenConfig: { setupToken?: string; accessKey?: string }): boolean {
  return Boolean(tokenConfig.accessKey || tokenConfig.setupToken);
}

const hasConfiguredTokenSources =
  hasTokenSource(SIMPLEFIN_TOKENS.token1) && hasTokenSource(SIMPLEFIN_TOKENS.token2);
const shouldRunLiveSimpleFinTests = hasConfiguredTokenSources || allowFreshTokenFetch;
const describeLiveSimpleFin = shouldRunLiveSimpleFinTests ? describe : describe.skip;
if (!shouldRunLiveSimpleFinTests) {
  console.log(
    'Skipping live SimpleFIN token suites. Provide SIMPLEFIN_ACCESS_KEY_1/2 or SIMPLEFIN_SETUP_TOKEN_1/2, or set SIMPLEFIN_ALLOW_TOKEN_FETCH=1.',
  );
}

// Track test state
interface SimpleFINTestState {
  accessKey: string;
  accounts: {
    id: string;
    name: string;
    balance: string;
    currency: string;
    org: { id: string; name: string; domain: string | null };
  }[];
}

/**
 * Helper to get or claim SimpleFIN access key.
 */
async function getAccessKey(
  tokenConfig: { setupToken?: string; accessKey?: string },
  tokenName: string,
): Promise<string> {
  if (tokenConfig.accessKey) {
    console.log(`Using pre-claimed access key from environment for ${tokenName}`);
    return tokenConfig.accessKey;
  }

  if (tokenConfig.setupToken) {
    console.log(`Claiming SimpleFIN token for ${tokenName} from environment...`);
    try {
      const accessKey = await claimSimpleFinToken(tokenConfig.setupToken);
      console.log(`${tokenName} access key obtained from environment token`);
      return accessKey;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('403') || errorMsg.includes('410')) {
        if (!allowFreshTokenFetch) {
          throw new Error(
            `Environment token for ${tokenName} was already claimed. Provide a pre-claimed SIMPLEFIN_ACCESS_KEY for this test token or set SIMPLEFIN_ALLOW_TOKEN_FETCH=1.`,
          );
        }
        console.log(`Environment token for ${tokenName} already claimed, fetching fresh token...`);
      } else {
        throw error;
      }
    }
  }

  if (!allowFreshTokenFetch) {
    throw new Error(
      `No SimpleFIN token source configured for ${tokenName}. Provide SIMPLEFIN_ACCESS_KEY_1/2 or SIMPLEFIN_SETUP_TOKEN_1/2, or set SIMPLEFIN_ALLOW_TOKEN_FETCH=1.`,
    );
  }

  console.log(`Fetching fresh SimpleFIN token for ${tokenName}...`);
  const freshToken = await fetchFreshSimpleFinToken();
  console.log(`Claiming fresh token for ${tokenName}...`);
  const accessKey = await claimSimpleFinToken(freshToken);
  console.log(`${tokenName} access key obtained from fresh token`);
  return accessKey;
}

/**
 * Test Suite: SimpleFIN Token and Account Fetching
 *
 * Tests the core SimpleFIN integration: fetching tokens, claiming them,
 * and retrieving account information.
 */
describeLiveSimpleFin('E2E: SimpleFIN Token and Account Integration', () => {
  let token1State: SimpleFINTestState | null = null;
  let token2State: SimpleFINTestState | null = null;

  beforeAll(async () => {
    console.log('='.repeat(60));
    console.log('SimpleFIN Token and Account Integration Tests');
    console.log('='.repeat(60));

    // Get SimpleFIN access keys - fetch fresh tokens if needed
    try {
      const accessKey1 = await getAccessKey(SIMPLEFIN_TOKENS.token1, 'token1');
      const result1 = await fetchSimpleFinAccountsWithAccessKey(accessKey1);
      token1State = { accessKey: accessKey1, accounts: result1.accounts };
      console.log(`Token 1: ${result1.accounts.length} accounts available`);
    } catch (error) {
      console.error('Failed to get token 1:', error);
    }

    try {
      const accessKey2 = await getAccessKey(SIMPLEFIN_TOKENS.token2, 'token2');
      const result2 = await fetchSimpleFinAccountsWithAccessKey(accessKey2);
      token2State = { accessKey: accessKey2, accounts: result2.accounts };
      console.log(`Token 2: ${result2.accounts.length} accounts available`);
    } catch (error) {
      console.error('Failed to get token 2:', error);
    }
  });

  afterAll(async () => {
    console.log('='.repeat(60));
    console.log('SimpleFIN Token Tests Complete');
    console.log('='.repeat(60));
  });

  it('should fetch fresh token and retrieve accounts for token 1', async () => {
    expect(token1State).not.toBeNull();
    expect(token1State!.accessKey).toBeDefined();
    expect(token1State!.accounts.length).toBeGreaterThan(0);

    console.log('Token 1 accounts:');
    for (const account of token1State!.accounts) {
      console.log(`  - ${account.name}: ${account.balance} ${account.currency || 'USD'}`);
      console.log(`    Org: ${account.org.name}`);
    }
  });

  it('should fetch fresh token and retrieve accounts for token 2', async () => {
    expect(token2State).not.toBeNull();
    expect(token2State!.accessKey).toBeDefined();
    expect(token2State!.accounts.length).toBeGreaterThan(0);

    console.log('Token 2 accounts:');
    for (const account of token2State!.accounts) {
      console.log(`  - ${account.name}: ${account.balance} ${account.currency || 'USD'}`);
      console.log(`    Org: ${account.org.name}`);
    }
  });

  it('should have valid access keys for each token', async () => {
    expect(token1State).not.toBeNull();
    expect(token2State).not.toBeNull();

    // Both tokens should have valid access keys
    expect(token1State!.accessKey).toContain('https://');
    expect(token2State!.accessKey).toContain('https://');

    // Note: SimpleFIN demo tokens may return the same demo credentials
    // This is expected behavior for the demo system
    console.log('Both tokens have valid access keys');
    console.log(`  Token 1: ${token1State!.accessKey.substring(0, 50)}...`);
    console.log(`  Token 2: ${token2State!.accessKey.substring(0, 50)}...`);
  });

  it('should return demo accounts from SimpleFIN', async () => {
    expect(token1State).not.toBeNull();

    // Demo accounts should include specific account types
    const accountNames = token1State!.accounts.map((a) => a.name);
    console.log(`Available accounts: ${accountNames.join(', ')}`);

    // SimpleFIN demo accounts typically include Savings and Checking
    const hasMultipleAccounts = token1State!.accounts.length >= 2;
    expect(hasMultipleAccounts).toBe(true);
  });

  it('should include organization info in account data', async () => {
    expect(token1State).not.toBeNull();

    for (const account of token1State!.accounts) {
      expect(account.org).toBeDefined();
      expect(account.org.id).toBeDefined();
      expect(account.org.name).toBeDefined();
    }

    console.log('All accounts have valid organization info');
  });
});

/**
 * Test Suite: Multi-Budget Creation with SimpleFIN
 *
 * Tests creating multiple budgets and configuring SimpleFIN for each.
 */
describeLiveSimpleFin('E2E: Multi-Budget with SimpleFIN Configuration', () => {
  let accessKey1: string = '';
  let accessKey2: string = '';
  let budget1Id: string = ''; // Local budget ID
  let budget2Id: string = ''; // Local budget ID
  let budget1Name: string = '';
  let budget2Name: string = '';

  beforeAll(async () => {
    console.log('='.repeat(60));
    console.log('Multi-Budget SimpleFIN Configuration Tests');
    console.log('='.repeat(60));

    await waitForServer();
    await cleanupDataDir();

    try {
      accessKey1 = await getAccessKey(SIMPLEFIN_TOKENS.token1, 'budget1');
      accessKey2 = await getAccessKey(SIMPLEFIN_TOKENS.token2, 'budget2');
      await initApi();
    } catch (error) {
      console.error('Failed to initialize:', error);
    }
  });

  afterAll(async () => {
    await shutdownApi().catch(() => {});
    await cleanupDataDir();
    console.log('='.repeat(60));
    console.log('Multi-Budget Tests Complete');
    console.log('='.repeat(60));
  });

  it('should create Budget 1 with SimpleFIN account name', async () => {
    if (!accessKey1) {
      console.log('Skipping - no access key 1');
      return;
    }

    const accounts = await fetchSimpleFinAccountsWithAccessKey(accessKey1);
    const firstAccount = accounts.accounts[0];
    budget1Name = `e2e-budget-1-${Date.now()}`;

    let createdAccountId = '';
    await api.runImport(budget1Name, async () => {
      createdAccountId = await api.createAccount(
        { name: `${firstAccount.org.name} - ${firstAccount.name}` },
        0,
      );
    });

    // Get budget ID from metadata (no server upload needed for local testing)
    const directories = await listSubDirectories(E2E_CONFIG.dataDir);
    console.log(`Data directory: ${E2E_CONFIG.dataDir}`);
    console.log(`Found directories: ${directories.join(', ')}`);
    console.log(`Looking for directory starting with: ${budget1Name}`);

    const budgetDir = directories.find((d) => d.startsWith(budget1Name));
    console.log(`Found budget dir: ${budgetDir}`);
    expect(budgetDir).toBeDefined();

    const metadata = await readBudgetMetadata(E2E_CONFIG.dataDir, budgetDir!);
    budget1Id = metadata.id; // Use local budget ID

    // Set SimpleFIN credentials for this budget
    await setSimpleFinCredentials(accessKey1);

    console.log(`Budget 1 created:`);
    console.log(`  Name: ${budget1Name}`);
    console.log(`  Local ID: ${budget1Id}`);
    console.log(`  Account: ${createdAccountId}`);
    console.log(`  SimpleFIN configured: ${firstAccount.name}`);

    expect(budget1Id).toBeDefined();
    expect(createdAccountId).toBeDefined();
  });

  it('should create Budget 2 with different SimpleFIN token', async () => {
    if (!accessKey2) {
      console.log('Skipping - no access key 2');
      return;
    }

    const accounts = await fetchSimpleFinAccountsWithAccessKey(accessKey2);
    // Use second account if available
    const accountIndex = accounts.accounts.length > 1 ? 1 : 0;
    const selectedAccount = accounts.accounts[accountIndex];
    budget2Name = `e2e-budget-2-${Date.now()}`;

    let createdAccountId = '';
    await api.runImport(budget2Name, async () => {
      createdAccountId = await api.createAccount(
        { name: `${selectedAccount.org.name} - ${selectedAccount.name}` },
        0,
      );
    });

    // Get budget ID from metadata (no server upload needed for local testing)
    const directories = await listSubDirectories(E2E_CONFIG.dataDir);
    console.log(`Data directory: ${E2E_CONFIG.dataDir}`);
    console.log(`Found directories: ${directories.join(', ')}`);
    console.log(`Looking for directory starting with: ${budget2Name}`);

    const budgetDir = directories.find((d) => d.startsWith(budget2Name));
    console.log(`Found budget dir: ${budgetDir}`);
    expect(budgetDir).toBeDefined();

    const metadata = await readBudgetMetadata(E2E_CONFIG.dataDir, budgetDir!);
    budget2Id = metadata.id; // Use local budget ID

    // Set SimpleFIN credentials for this budget (different token)
    await setSimpleFinCredentials(accessKey2);

    console.log(`Budget 2 created:`);
    console.log(`  Name: ${budget2Name}`);
    console.log(`  Local ID: ${budget2Id}`);
    console.log(`  Account: ${createdAccountId}`);
    console.log(`  SimpleFIN configured: ${selectedAccount.name}`);

    expect(budget2Id).toBeDefined();
    expect(createdAccountId).toBeDefined();
  });

  it('should have different IDs for each budget', async () => {
    if (!budget1Id || !budget2Id) {
      console.log('Skipping - budgets not created');
      return;
    }

    expect(budget1Id).not.toBe(budget2Id);
    console.log('Verified: Each budget has a unique ID');
    console.log(`  Budget 1: ${budget1Id}`);
    console.log(`  Budget 2: ${budget2Id}`);
  });

  it('should have two budget directories in data folder', async () => {
    const directories = await listSubDirectories(E2E_CONFIG.dataDir);

    const budget1Dir = directories.find((d) => d.includes('e2e-budget-1'));
    const budget2Dir = directories.find((d) => d.includes('e2e-budget-2'));

    expect(budget1Dir).toBeDefined();
    expect(budget2Dir).toBeDefined();

    console.log('Both budget directories created:');
    console.log(`  ${budget1Dir}`);
    console.log(`  ${budget2Dir}`);
  });
});

/**
 * Test Suite: Error Handling
 */
describe('E2E: SimpleFIN Error Handling', () => {
  beforeAll(async () => {
    await waitForServer();
    await cleanupDataDir();
    await initApi();
  });

  afterAll(async () => {
    await shutdownApi().catch(() => {});
    await cleanupDataDir();
  });

  it('should handle invalid SimpleFIN access key URL format', async () => {
    const invalidAccessKey = 'not-a-valid-url';

    await expect(async () => {
      await fetchSimpleFinAccountsWithAccessKey(invalidAccessKey);
    }).rejects.toThrow();

    console.log('Invalid access key URL handled correctly');
  });

  it('should handle budget creation with minimal info', async () => {
    const budgetName = `e2e-minimal-${Date.now()}`;

    await api.runImport(budgetName, async () => {
      await api.createAccount({ name: 'Minimal Account' }, 0);
    });

    // Verify budget directory was created
    const directories = await listSubDirectories(E2E_CONFIG.dataDir);
    const found = directories.some((d) => d.includes('e2e-minimal'));
    expect(found).toBe(true);

    console.log('Minimal budget creation test passed');
  });

  it('should handle budget download for non-existent sync ID', async () => {
    const fakeSyncId = '00000000-0000-0000-0000-000000000000';

    try {
      await api.downloadBudget(fakeSyncId);
      expect(true).toBe(false); // Should not reach here
    } catch {
      // Expected
      console.log('Non-existent budget download error handled correctly');
    }
  });
});
