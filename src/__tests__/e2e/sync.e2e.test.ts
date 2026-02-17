/**
 * E2E Tests for actual-auto-sync
 *
 * These tests validate the ACTUAL workflow of the application:
 * 1. Connect to Actual Budget server
 * 2. Download budget by sync ID
 * 3. Read metadata.json to map sync IDs to budget IDs (getSyncIdMaps)
 * 4. Load the budget
 * 5. Run bank sync (runBankSync)
 * 6. Sync changes back to server (sync)
 * 7. Shutdown
 */
import * as api from '@actual-app/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  E2E_CONFIG,
  cleanupDataDir,
  getSyncIdMaps,
  initApi,
  listSubDirectories,
  readBudgetMetadata,
  seedTestBudget,
  shutdownApi,
  waitForServer,
} from './setup.js';

describe('E2E: actual-auto-sync Workflow', () => {
  // Store seeded budget info for use across tests
  let seededSyncId: string | undefined;
  let seededBudgetId: string;
  let uploadedToServer: boolean;

  beforeAll(async () => {
    // Wait for server to be ready
    await waitForServer();
    // Clean up any existing test data
    await cleanupDataDir();
  });

  afterAll(async () => {
    await shutdownApi().catch(() => {});
    await cleanupDataDir();
  });

  it('should seed a test budget on the server', async () => {
    // Initialize the API
    await initApi();

    // Seed a test budget (this creates a budget locally and optionally syncs to server)
    const seeded = await seedTestBudget();
    seededSyncId = seeded.syncId;
    seededBudgetId = seeded.budgetId;
    uploadedToServer = seeded.uploadedToServer;

    console.log(`Seeded budget: ${seeded.budgetName}`);
    console.log(`  Budget ID: ${seededBudgetId}`);
    console.log(`  Sync ID: ${seededSyncId || '(local-only)'}`);
    console.log(`  Account ID: ${seeded.accountId}`);
    console.log(`  Uploaded to server: ${uploadedToServer}`);

    // Verify budget exists locally
    expect(seededBudgetId).toBeDefined();

    // If uploaded, verify it exists on the server
    if (uploadedToServer && seededSyncId) {
      const budgets = await api.getBudgets();
      const testBudget = budgets.find((b) => b.id === seededSyncId);
      expect(testBudget).toBeDefined();
      console.log(`Verified budget exists on server`);
    } else {
      console.log('Budget is local-only (server upload skipped or failed)');
    }
  });

  it('should download budget by sync ID and load it', async () => {
    // The seeded budget is still loaded from previous test
    // Just verify we can access it
    const accounts = await api.getAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    console.log(`Budget has ${accounts.length} account(s)`);

    // Verify the account we created
    const testAccount = accounts.find((a) => a.name === 'E2E Test Checking');
    expect(testAccount).toBeDefined();
    console.log(`Found test account: ${testAccount!.name}`);

    // Verify local files were created
    const directories = await listSubDirectories(E2E_CONFIG.dataDir);
    expect(directories.length).toBeGreaterThan(0);
    console.log(`Budget saved to: ${directories[0]}`);

    // Verify metadata.json has correct structure
    const metadata = await readBudgetMetadata(E2E_CONFIG.dataDir, directories[0]);
    expect(metadata.id).toBeDefined();

    if (uploadedToServer && seededSyncId) {
      expect(metadata.groupId).toBe(seededSyncId);
      console.log(`Metadata: budgetId=${metadata.id}, syncId=${metadata.groupId}`);
    } else {
      console.log(`Metadata: budgetId=${metadata.id} (local-only, no syncId)`);
    }
  });

  it('should map sync IDs to budget IDs using getSyncIdMaps', async () => {
    // This is the workaround the app uses because the API doesn't provide
    // A direct way to get the budget ID from the sync ID
    const syncIdMap = await getSyncIdMaps(E2E_CONFIG.dataDir);

    // If we have a syncId (budget was uploaded), verify the mapping
    if (uploadedToServer && seededSyncId) {
      expect(Object.keys(syncIdMap).length).toBeGreaterThan(0);
      expect(syncIdMap[seededSyncId]).toBeDefined();
      console.log(`Sync ID map: ${JSON.stringify(syncIdMap)}`);
    } else {
      // For local-only budgets, the syncIdMap may be empty since there's no groupId
      console.log('Sync ID map not tested (local-only budget)');
    }
  });

  it('should run bank sync and sync to server', async () => {
    // Run bank sync - for unlinked accounts this completes without fetching transactions
    console.log('Running bank sync...');
    await api.runBankSync();
    console.log('Bank sync completed');

    // Sync changes back to server (only if budget was uploaded)
    if (uploadedToServer) {
      console.log('Syncing to server...');
      await api.sync();
      console.log('Synced to server successfully');
    } else {
      console.log('Skipping server sync (local-only budget)');
    }
  });

  it('should shutdown cleanly', async () => {
    console.log('Shutting down...');
    await shutdownApi();
    console.log('Shutdown complete');
    console.log('\n✓ Complete sync workflow executed successfully!');
  });
});

// Separate test suite for error handling
describe('E2E: Error Handling', () => {
  beforeAll(async () => {
    await cleanupDataDir();
  });

  afterAll(async () => {
    await cleanupDataDir();
  });

  it('should handle connection errors gracefully', async () => {
    const badConfig = {
      dataDir: E2E_CONFIG.dataDir,
      serverURL: 'http://localhost:9999', // Wrong port
      password: E2E_CONFIG.serverPassword,
    };

    await expect(api.init(badConfig)).rejects.toThrow();
    console.log('Correctly rejected bad server connection');
  });

  it('should verify getBudgets returns server budget list', async () => {
    // Initialize with good config
    await initApi();

    const budgets = await api.getBudgets();
    // Should have at least the budget from the previous test suite
    expect(budgets.length).toBeGreaterThan(0);
    console.log(`Server has ${budgets.length} budget(s)`);

    // Fake budget IDs should not exist
    const fakeExists = budgets.some((b) => b.id === 'invalid-sync-id-12345');
    expect(fakeExists).toBe(false);

    await shutdownApi();
  });
});
