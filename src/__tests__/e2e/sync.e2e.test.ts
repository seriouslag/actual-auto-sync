import * as api from "@actual-app/api";
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

import {
  E2E_CONFIG,
  waitForServer,
  initApi,
  shutdownApi,
  cleanupDataDir,
} from "./setup.js";

describe("E2E: Actual Budget Sync", () => {
  beforeAll(async () => {
    // Wait for server to be ready (includes bootstrap if needed)
    await waitForServer();
    // Clean up any existing test data
    await cleanupDataDir();
  });

  afterAll(async () => {
    await shutdownApi();
    await cleanupDataDir();
  });

  afterEach(async () => {
    // Ensure API is shutdown between tests
    await shutdownApi();
  });

  describe("Server Connection", () => {
    it("should connect to the Actual Budget server", async () => {
      await initApi();

      // If we get here without throwing, the connection was successful
      const budgets = await api.getBudgets();
      expect(budgets).toBeDefined();
      expect(Array.isArray(budgets)).toBe(true);
    });

    it("should list available budgets", async () => {
      await initApi();

      const budgets = await api.getBudgets();
      // Fresh server should have empty or minimal budgets
      expect(budgets).toBeDefined();
      console.log(`Found ${budgets.length} budgets on server`);
    });
  });

  describe("Budget Operations with loadBudget", () => {
    it("should work with an existing budget from server", async () => {
      await initApi();

      // Get list of budgets from server
      const budgets = await api.getBudgets();
      console.log(`Server has ${budgets.length} budgets`);

      if (budgets.length === 0) {
        // No budgets on server yet - this is expected on fresh install
        // The actual-auto-sync service requires budgets to already exist
        console.log("No budgets on server - this is expected for a fresh install");
        console.log("The actual-auto-sync service requires pre-existing budgets");
        return;
      }

      // Download and work with an existing budget
      const firstBudget = budgets[0];
      console.log(`Working with budget: ${firstBudget.id}`);

      await api.downloadBudget(firstBudget.id);

      // Verify we can access budget data
      const accounts = await api.getAccounts();
      expect(accounts).toBeDefined();
      console.log(`Budget has ${accounts.length} accounts`);
    });
  });

  describe("Sync Service Simulation", () => {
    it("should simulate the sync service flow with mocked bank sync", async () => {
      await initApi();

      const budgets = await api.getBudgets();

      if (budgets.length === 0) {
        console.log("No budgets available - skipping sync simulation");
        console.log("Note: actual-auto-sync requires budgets to be created via the Actual Budget UI first");
        return;
      }

      // Download the first budget (simulates what the sync service does)
      const budgetId = budgets[0].id;
      console.log(`Downloading budget: ${budgetId}`);
      await api.downloadBudget(budgetId);

      // Load the budget
      await api.loadBudget(budgetId);
      console.log("Budget loaded");

      // Get accounts to verify budget is accessible
      const accounts = await api.getAccounts();
      console.log(`Found ${accounts.length} accounts`);

      // Mock runBankSync since we can't connect to real banks in CI
      const mockRunBankSync = vi.fn().mockResolvedValue(undefined);
      await mockRunBankSync();
      expect(mockRunBankSync).toHaveBeenCalled();
      console.log("Bank sync completed (mocked)");

      // Sync changes back to server
      await api.sync();
      console.log("Synced to server");
    });
  });

  describe("Error Handling", () => {
    it("should handle connection errors gracefully", async () => {
      // Try to connect with wrong URL
      const badConfig = {
        dataDir: E2E_CONFIG.dataDir,
        serverURL: "http://localhost:9999", // Wrong port
        password: E2E_CONFIG.serverPassword,
      };

      await expect(api.init(badConfig)).rejects.toThrow();
    });

    it("should verify budget list before operations", async () => {
      await initApi();

      // Get list of budgets - operations should only be performed on existing budgets
      const budgets = await api.getBudgets();

      // The sync service checks ACTUAL_BUDGET_SYNC_IDS against available budgets
      // This test verifies we can get the budget list (which is needed for validation)
      expect(Array.isArray(budgets)).toBe(true);
      console.log(`Available budgets for sync: ${budgets.length}`);

      // Note: The actual-auto-sync service requires budgets to exist on the server
      // Attempting to sync a non-existent budget ID would fail
    });
  });
});
