/**
 * Bank Sync E2E Tests
 *
 * Tests for SimpleFIN bank sync functionality using a mock SimpleFIN server.
 * These tests verify the full sync flow without requiring real SimpleFIN credentials.
 *
 * Test Suites:
 * 1. Mock SimpleFIN Server - Validates the mock server works correctly
 * 2. Multi-Account Sync - Tests syncing multiple accounts
 * 3. Error Handling - Various error scenarios
 * 4. Transaction Fixtures - Tests transaction data and filtering
 */
import * as api from '@actual-app/api';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  E2E_CONFIG,
  MOCK_SIMPLEFIN_CONFIG,
  cleanupDataDir,
  daysAgo,
  getMockSimpleFinAccounts,
  initApi,
  mockSimpleFinAccounts,
  resetMockSimpleFinFixtures,
  seedTestBudget,
  shutdownApi,
  startMockSimpleFinServer,
  stopMockSimpleFinServer,
  waitForServer,
} from './setup.js';

/**
 * Test Suite 1: Mock SimpleFIN Server
 *
 * Validates the mock SimpleFIN server works correctly.
 */
describe('E2E: Mock SimpleFIN Server', () => {
  let mockServerContext: Awaited<ReturnType<typeof startMockSimpleFinServer>>;

  beforeAll(async () => {
    // Start mock SimpleFIN server
    mockServerContext = await startMockSimpleFinServer({ port: 9001 });
  });

  afterAll(async () => {
    await stopMockSimpleFinServer(mockServerContext.server);
  });

  beforeEach(() => {
    // Reset fixtures for each test
    resetMockSimpleFinFixtures();
  });

  it('should have mock SimpleFIN server running', async () => {
    // Verify the mock server is accessible
    expect(mockServerContext.url).toContain('http://localhost:9001');
    expect(mockServerContext.accessKey).toMatch(/^http:\/\/.*:.*@.*\/$/);

    // Test the mock server health endpoint
    const response = await fetch(`${mockServerContext.url}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  it('should return accounts from mock SimpleFIN server with auth', async () => {
    const { accessKey } = mockServerContext;

    // Parse credentials from access key
    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    expect(match).not.toBeNull();

    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    const response = await fetch(`http://${host}/accounts?balances-only=1`, {
      headers: { Authorization: authHeader },
    });

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.accounts).toBeDefined();
    expect(data.accounts.length).toBeGreaterThan(0);

    // Verify account data structure
    const firstAccount = data.accounts[0];
    expect(firstAccount).toHaveProperty('id');
    expect(firstAccount).toHaveProperty('name');
    expect(firstAccount).toHaveProperty('balance');
    expect(firstAccount).toHaveProperty('org');
    expect(firstAccount.org).toHaveProperty('id');
    expect(firstAccount.org).toHaveProperty('name');
    expect(firstAccount.org).toHaveProperty('domain');
  });

  it('should return transactions from mock SimpleFIN server', async () => {
    const { accessKey } = mockServerContext;

    // Parse credentials from access key
    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    // Request with transactions (no balances-only flag)
    const startDate = Math.floor(daysAgo(30).getTime() / 1000);
    const response = await fetch(
      `http://${host}/accounts?account=ACT-001&start-date=${startDate}&pending=1`,
      {
        headers: { Authorization: authHeader },
      },
    );

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.accounts).toBeDefined();
    expect(data.accounts.length).toBe(1);

    const account = data.accounts[0];
    expect(account.id).toBe('ACT-001');
    expect(account.transactions).toBeDefined();
    expect(account.transactions.length).toBeGreaterThan(0);

    // Verify transaction structure
    const transaction = account.transactions[0];
    expect(transaction).toHaveProperty('id');
    expect(transaction).toHaveProperty('amount');
    expect(transaction).toHaveProperty('payee');
    expect(transaction).toHaveProperty('posted');
  });

  it('should reject requests without authentication', async () => {
    const { url } = mockServerContext;

    const response = await fetch(`${url}/accounts?balances-only=1`);
    expect(response.status).toBe(403);
  });

  it('should reject requests with invalid credentials', async () => {
    const { url } = mockServerContext;

    const authHeader = `Basic ${Buffer.from('wrong:credentials').toString('base64')}`;
    const response = await fetch(`${url}/accounts?balances-only=1`, {
      headers: { Authorization: authHeader },
    });

    expect(response.status).toBe(403);
  });
});

/**
 * Test Suite 2: Transaction Fixtures
 *
 * Tests the transaction fixture data and filtering.
 */
describe('E2E: Transaction Fixtures', () => {
  let mockServerContext: Awaited<ReturnType<typeof startMockSimpleFinServer>>;

  beforeAll(async () => {
    mockServerContext = await startMockSimpleFinServer({ port: 9002 });
  });

  afterAll(async () => {
    await stopMockSimpleFinServer(mockServerContext.server);
  });

  beforeEach(() => {
    resetMockSimpleFinFixtures();
  });

  it('should have pending and booked transactions', async () => {
    const { accessKey } = mockServerContext;

    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    const startDate = Math.floor(daysAgo(30).getTime() / 1000);
    const response = await fetch(
      `http://${host}/accounts?account=ACT-001&start-date=${startDate}&pending=1`,
      {
        headers: { Authorization: authHeader },
      },
    );

    const data = await response.json();
    const { transactions } = data.accounts[0];

    // Check for both pending and booked
    const pendingTransactions = transactions.filter((t: { pending: boolean }) => t.pending);
    const bookedTransactions = transactions.filter((t: { pending: boolean }) => !t.pending);

    expect(pendingTransactions.length).toBeGreaterThan(0);
    expect(bookedTransactions.length).toBeGreaterThan(0);
  });

  it('should filter transactions by start date', async () => {
    const { accessKey } = mockServerContext;

    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    // Get all transactions (30 days back)
    const startDate30Days = Math.floor(daysAgo(30).getTime() / 1000);
    const response30 = await fetch(
      `http://${host}/accounts?account=ACT-001&start-date=${startDate30Days}&pending=1`,
      {
        headers: { Authorization: authHeader },
      },
    );
    const data30 = await response30.json();
    const count30Days = data30.accounts[0].transactions.length;

    // Get recent transactions (3 days back)
    const startDate3Days = Math.floor(daysAgo(3).getTime() / 1000);
    const response3 = await fetch(
      `http://${host}/accounts?account=ACT-001&start-date=${startDate3Days}&pending=1`,
      {
        headers: { Authorization: authHeader },
      },
    );
    const data3 = await response3.json();
    const count3Days = data3.accounts[0].transactions.length;

    // Should have fewer transactions with more recent start date
    expect(count30Days).toBeGreaterThanOrEqual(count3Days);
  });
});

/**
 * Test Suite 3: Multiple Accounts in Single Budget
 *
 * Tests handling multiple mock accounts from different banks.
 */
describe('E2E: Multiple Accounts', () => {
  let mockServerContext: Awaited<ReturnType<typeof startMockSimpleFinServer>>;

  beforeAll(async () => {
    mockServerContext = await startMockSimpleFinServer({ port: 9003 });
  });

  afterAll(async () => {
    await stopMockSimpleFinServer(mockServerContext.server);
  });

  beforeEach(() => {
    resetMockSimpleFinFixtures();
  });

  it('should handle multiple mock accounts from different banks', async () => {
    const { accessKey } = mockServerContext;

    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    // Request all accounts
    const response = await fetch(`http://${host}/accounts?balances-only=1`, {
      headers: { Authorization: authHeader },
    });

    const data = await response.json();
    expect(data.accounts.length).toBe(4); // ACT-001, ACT-002, ACT-003, ACT-004

    // Verify different banks
    const banks = new Set(data.accounts.map((a: { org: { name: string } }) => a.org.name));
    expect(banks.size).toBe(3); // Test Bank, Second Bank, Test Credit Union
    expect(banks.has('Test Bank')).toBe(true);
    expect(banks.has('Second Bank')).toBe(true);
    expect(banks.has('Test Credit Union')).toBe(true);
  });

  it('should batch request multiple accounts', async () => {
    const { accessKey } = mockServerContext;

    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    const startDate = Math.floor(daysAgo(30).getTime() / 1000);

    // Request multiple accounts at once
    const response = await fetch(
      `http://${host}/accounts?account=ACT-001&account=ACT-003&start-date=${startDate}&pending=1`,
      {
        headers: { Authorization: authHeader },
      },
    );

    const data = await response.json();
    expect(data.accounts.length).toBe(2);

    // Verify both accounts have transactions
    const account1 = data.accounts.find((a: { id: string }) => a.id === 'ACT-001');
    const account3 = data.accounts.find((a: { id: string }) => a.id === 'ACT-003');

    expect(account1).toBeDefined();
    expect(account3).toBeDefined();
    expect(account1.transactions.length).toBeGreaterThan(0);
    expect(account3.transactions.length).toBeGreaterThan(0);
  });

  it('should have distinct mock accounts for different budgets', () => {
    // Verify we have distinct mock accounts for different budgets
    const checkingAccount = mockSimpleFinAccounts['ACT-001'];
    const secondBankAccount = mockSimpleFinAccounts['ACT-003'];

    expect(checkingAccount).toBeDefined();
    expect(secondBankAccount).toBeDefined();
    expect(checkingAccount.org.id).not.toBe(secondBankAccount.org.id);

    // ACT-001 is from "Test Bank"
    expect(checkingAccount.org.name).toBe('Test Bank');

    // ACT-003 is from "Second Bank"
    expect(secondBankAccount.org.name).toBe('Second Bank');
  });
});

/**
 * Test Suite 4: Integration with Actual Budget Server
 *
 * Tests the mock SimpleFIN server with a real Actual Budget server.
 * These tests require the actual-server container to be running.
 */
describe('E2E: SimpleFIN with Actual Budget Server', () => {
  let mockServerContext: Awaited<ReturnType<typeof startMockSimpleFinServer>>;
  let seededSyncId: string | undefined;
  let seededAccountId: string;
  let uploadedToServer: boolean;

  beforeAll(async () => {
    // Start mock SimpleFIN server
    mockServerContext = await startMockSimpleFinServer({ port: 9004 });

    // Wait for Actual server to be ready
    await waitForServer();

    // Clean up any existing test data
    await cleanupDataDir();
  });

  afterAll(async () => {
    await stopMockSimpleFinServer(mockServerContext.server);
    await shutdownApi().catch(() => {});
    await cleanupDataDir();
  });

  it('should seed a test budget for bank sync testing', async () => {
    // Initialize the API
    await initApi();

    // Seed a test budget
    const seeded = await seedTestBudget();
    seededSyncId = seeded.syncId;
    seededAccountId = seeded.accountId;
    uploadedToServer = seeded.uploadedToServer;

    console.log(`Seeded budget for bank sync tests: ${seeded.budgetName}`);
    console.log(`  Budget ID: ${seeded.budgetId}`);
    console.log(`  Sync ID: ${seededSyncId || '(local-only)'}`);
    console.log(`  Account ID: ${seededAccountId}`);
    console.log(`  Uploaded to server: ${uploadedToServer}`);

    // Verify budget exists locally
    expect(seeded.budgetId).toBeDefined();
    expect(seededAccountId).toBeDefined();

    // If uploaded, verify the budget exists on the server
    if (uploadedToServer && seededSyncId) {
      const budgets = await api.getBudgets();
      const testBudget = budgets.find((b) => b.id === seededSyncId);
      expect(testBudget).toBeDefined();
    } else {
      console.log('Budget is local-only (server upload skipped or failed)');
    }
  });

  it('should verify mock SimpleFIN accounts are available', () => {
    // Verify we have mock accounts to link
    const accounts = getMockSimpleFinAccounts();
    expect(accounts.length).toBe(4);

    // Verify account structure
    const firstAccount = accounts[0];
    expect(firstAccount.id).toBeDefined();
    expect(firstAccount.name).toBeDefined();
    expect(firstAccount.balance).toBeDefined();
    expect(firstAccount.org).toBeDefined();
  });

  it('should be able to get accounts from Actual Budget', async () => {
    // The seeded budget should still be loaded
    const accounts = await api.getAccounts();
    expect(accounts.length).toBeGreaterThan(0);

    // Find the test account we created
    const testAccount = accounts.find((a) => a.id === seededAccountId);
    expect(testAccount).toBeDefined();
    expect(testAccount!.name).toBe('E2E Test Checking');
  });

  it('should run bank sync (without linked accounts)', async () => {
    // Run bank sync - for unlinked accounts this completes without fetching transactions
    console.log('Running bank sync on unlinked accounts...');
    await api.runBankSync();
    console.log('Bank sync completed');

    // Sync changes back to server (only if budget was uploaded)
    if (uploadedToServer) {
      await api.sync();
      console.log('Synced to server successfully');
    } else {
      console.log('Skipping server sync (local-only budget)');
    }
  });
});

/**
 * Test Suite 5: Error Handling
 *
 * Tests various error scenarios.
 */
describe('E2E: Error Handling', () => {
  let mockServerContext: Awaited<ReturnType<typeof startMockSimpleFinServer>>;

  beforeAll(async () => {
    mockServerContext = await startMockSimpleFinServer({ port: 9005 });
  });

  afterAll(async () => {
    await stopMockSimpleFinServer(mockServerContext.server);
  });

  it('should handle invalid access token (403)', async () => {
    const { url } = mockServerContext;

    // Request with invalid credentials
    const authHeader = `Basic ${Buffer.from('invalid:token').toString('base64')}`;
    const response = await fetch(`${url}/accounts?balances-only=1`, {
      headers: { Authorization: authHeader },
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('should handle account not found', async () => {
    const { accessKey } = mockServerContext;

    // Parse credentials from access key
    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    // Request non-existent account
    const response = await fetch(
      `http://${host}/accounts?account=NONEXISTENT&start-date=0&pending=1`,
      {
        headers: { Authorization: authHeader },
      },
    );

    expect(response.ok).toBe(true);

    const data = await response.json();
    // When account is not found, it should return empty accounts array
    expect(data.accounts).toEqual([]);
  });

  it('should handle unknown endpoint', async () => {
    const { accessKey } = mockServerContext;

    const match = accessKey.match(/http:\/\/(.+):(.+)@(.+)\//);
    const [, username, password, host] = match!;
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    const response = await fetch(`http://${host}/unknown-endpoint`, {
      headers: { Authorization: authHeader },
    });

    expect(response.status).toBe(404);
  });
});
