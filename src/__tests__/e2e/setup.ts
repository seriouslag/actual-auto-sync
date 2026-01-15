import { mkdir, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import * as api from "@actual-app/api";

// E2E test configuration - uses environment variables or defaults
export const E2E_CONFIG = {
  serverUrl: process.env.ACTUAL_SERVER_URL || "http://localhost:5006",
  serverPassword: process.env.ACTUAL_SERVER_PASSWORD || "test-password-e2e",
  dataDir: process.env.ACTUAL_DATA_DIR || "./e2e-data",
};

/**
 * Check if the server needs to be bootstrapped (first-time setup)
 */
export async function needsBootstrap(): Promise<boolean> {
  try {
    const response = await fetch(`${E2E_CONFIG.serverUrl}/account/needs-bootstrap`);
    if (response.ok) {
      const data = await response.json();
      return data.status === "ok" && data.data?.bootstrapped === false;
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
  console.log("Bootstrapping server with initial password...");

  const response = await fetch(`${E2E_CONFIG.serverUrl}/account/bootstrap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: E2E_CONFIG.serverPassword }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to bootstrap server: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (data.status !== "ok") {
    throw new Error(`Bootstrap failed: ${JSON.stringify(data)}`);
  }

  console.log("Server bootstrapped successfully");
}

/**
 * Wait for the Actual Budget server to be ready
 */
export async function waitForServer(
  maxAttempts = 30,
  delayMs = 1000
): Promise<void> {
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
      console.log(
        `Waiting for server... attempt ${attempt}/${maxAttempts}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `Server at ${E2E_CONFIG.serverUrl} not ready after ${maxAttempts} attempts`
  );
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
    const dateStr = date.toISOString().split("T")[0];

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
  syncId: string;
  accountId: string;
}> {
  const budgetName = `e2e-sync-test-${Date.now()}`;

  console.log(`Seeding test budget: ${budgetName}`);

  let createdAccountId = "";

  await api.runImport(budgetName, async () => {
    // Create a checking account with initial balance
    createdAccountId = await api.createAccount(
      {
        name: "E2E Test Checking",
        type: "checking",
      },
      10000 * 100 // $10,000 initial balance in cents
    );

    console.log(`Created account: ${createdAccountId}`);

    // Add sample transactions
    const transactions = createSampleTransactions(5);
    const transactionIds = await api.addTransactions(createdAccountId, transactions);
    console.log(`Added ${transactionIds.length} transactions`);
  });

  // Sync to ensure server has the data
  await api.sync();

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
    syncId: metadata.groupId, // This is the UUID sync ID used by downloadBudget
    accountId: createdAccountId,
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
  return subDirectories
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

/**
 * Get sync ID to budget ID mapping by reading metadata.json files.
 * Mirror of getSyncIdMaps() from src/utils.ts
 *
 * This is the workaround the app uses because the Actual API doesn't provide
 * a direct way to get the budget ID from the sync ID.
 */
export async function getSyncIdMaps(
  dataDir: string
): Promise<Record<string, string>> {
  console.log("Getting sync id to budget id map...");
  try {
    const directories = await listSubDirectories(dataDir);
    const syncIdToBudgetId: Record<string, string> = {};

    const tasks = directories.map(async (subDir) => {
      try {
        const metadataPath = join(dataDir, subDir, "metadata.json");
        const metadataContent = await readFile(metadataPath, "utf-8");
        const metadata = JSON.parse(metadataContent);
        // groupId is the sync ID, id is the budget ID
        syncIdToBudgetId[metadata.groupId] = metadata.id;
        console.log(`  Found mapping: syncId=${metadata.groupId} -> budgetId=${metadata.id}`);
      } catch (err) {
        // Skip directories without metadata.json
        console.log(`  Skipping ${subDir}: no valid metadata.json`);
      }
    });

    await Promise.all(tasks);
    console.log(`Sync id to budget id map created: ${Object.keys(syncIdToBudgetId).length} entries`);
    return syncIdToBudgetId;
  } catch (err) {
    console.error("Error creating map from sync id to budget id:", err);
    throw err;
  }
}

/**
 * Simulate the syncAllAccounts function from src/utils.ts
 * This is what the app does after loading a budget.
 */
export async function syncAllAccounts(): Promise<void> {
  console.log("Syncing all accounts...");
  await api.runBankSync();
  console.log("All accounts synced.");
  console.log("Syncing budget to server...");
  await api.sync();
  console.log("Budget synced to server successfully.");
}

/**
 * Interface for budget metadata stored in metadata.json
 */
export interface BudgetMetadata {
  id: string;      // Budget ID (local identifier)
  groupId: string; // Sync ID (server identifier)
  name?: string;
}

/**
 * Read metadata.json from a downloaded budget directory.
 */
export async function readBudgetMetadata(
  dataDir: string,
  budgetDirName: string
): Promise<BudgetMetadata> {
  const metadataPath = join(dataDir, budgetDirName, "metadata.json");
  const content = await readFile(metadataPath, "utf-8");
  return JSON.parse(content);
}
