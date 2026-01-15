import { mkdir, rm } from "node:fs/promises";

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

  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    transactions.push({
      date: dateStr,
      amount: -((i + 1) * 1000), // Negative = expense, in cents
      payee_name: `Test Payee ${i + 1}`,
      notes: `E2E test transaction ${i + 1}`,
      imported_id: `e2e-test-${Date.now()}-${i}`,
    });
  }

  return transactions;
}
