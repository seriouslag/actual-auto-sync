import { readdir, readFile } from "node:fs/promises";

import { runBankSync } from "@actual-app/api";

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  MockedObject,
} from "vitest";

import cronstrue from "cronstrue";
import { logger } from "../logger.js";
import {
  formatCronSchedule,
  syncAllAccounts,
  listSubDirectories,
  getSyncIdMaps,
  sync,
} from "../utils.js";

// Mock external dependencies
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@actual-app/api", () => ({
  init: vi.fn(),
  shutdown: vi.fn(),
  runBankSync: vi.fn(),
  downloadBudget: vi.fn(),
  loadBudget: vi.fn(),
  sync: vi.fn(),
}));

// Import mocked functions
const {
  init,
  shutdown,
  downloadBudget,
  loadBudget,
  sync: syncBudget,
} = await import("@actual-app/api");
const { mkdir } = await import("node:fs/promises");

vi.mock("cronstrue", () => ({
  default: {
    toString: vi.fn(),
  },
}));

vi.mock("../env.js", () => ({
  env: {
    ACTUAL_SERVER_URL: "http://localhost:5006",
    ACTUAL_SERVER_PASSWORD: "test-password",
    CRON_SCHEDULE: "0 0 * * *",
    ACTUAL_BUDGET_SYNC_IDS: ["budget1", "budget2"],
    ENCRYPTION_PASSWORDS: ["pass1", "pass2"],
    TIMEZONE: "Etc/UTC",
    RUN_ON_START: false,
  },
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("utils.ts functions", () => {
  let cronstrueMock: MockedObject<typeof cronstrue>;

  beforeEach(async () => {
    vi.clearAllMocks();
    cronstrueMock = vi.mocked(cronstrue);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("formatCronSchedule", () => {
    it("should format cron schedule using cronstrue", () => {
      cronstrueMock.toString.mockReturnValue("At 12:00 AM");

      const result = formatCronSchedule("0 0 * * *");

      expect(cronstrueMock.toString).toHaveBeenCalledWith("0 0 * * *");
      expect(result).toBe("at 12:00 am");
    });

    it("should convert result to lowercase", () => {
      cronstrueMock.toString.mockReturnValue("EVERY DAY AT MIDNIGHT");

      const result = formatCronSchedule("0 0 * * *");
      expect(result).toBe("every day at midnight");
    });
  });

  describe("syncAllAccounts", () => {
    it("should successfully sync all accounts and budget", async () => {
      vi.mocked(runBankSync).mockResolvedValue(undefined);
      vi.mocked(syncBudget).mockResolvedValue(undefined);

      await syncAllAccounts();

      expect(logger.info).toHaveBeenCalledWith("Syncing all accounts...");
      expect(runBankSync).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("All accounts synced.");
      expect(logger.info).toHaveBeenCalledWith("Syncing budget to server...");
      expect(syncBudget).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Budget synced to server.");
    });

    it("should handle errors during sync", async () => {
      const error = new Error("Sync failed");
      vi.mocked(runBankSync).mockRejectedValue(error);

      await syncAllAccounts();

      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        "Error syncing all accounts"
      );
    });

    it("should handle errors during budget sync", async () => {
      const error = new Error("Budget sync failed");
      vi.mocked(runBankSync).mockResolvedValue(undefined);
      vi.mocked(syncBudget).mockRejectedValue(error);

      await syncAllAccounts();

      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        "Error syncing all accounts"
      );
    });
  });

  describe("listSubDirectories", () => {
    it("should return only directory names", async () => {
      const mockDirents = [
        { name: "dir1", isDirectory: () => true },
        { name: "file1", isDirectory: () => false },
        { name: "dir2", isDirectory: () => true },
        { name: "file2", isDirectory: () => false },
      ];

      vi.mocked(readdir).mockResolvedValue(mockDirents as any);

      const result = await listSubDirectories("/test/path");

      expect(readdir).toHaveBeenCalledWith("/test/path", {
        withFileTypes: true,
      });
      expect(result).toEqual(["dir1", "dir2"]);
    });

    it("should handle empty directory", async () => {
      vi.mocked(readdir).mockResolvedValue([]);

      const result = await listSubDirectories("/test/path");

      expect(result).toEqual([]);
    });

    it("should handle readdir errors", async () => {
      const error = new Error("Permission denied");
      vi.mocked(readdir).mockRejectedValue(error);

      await expect(listSubDirectories("/test/path")).rejects.toThrow(
        "Permission denied"
      );
    });
  });

  describe("getSyncIdMaps", () => {
    it("should create sync id to budget id mapping", async () => {
      const mockMetadata1 = { groupId: "sync1", id: "budget1" };
      const mockMetadata2 = { groupId: "sync2", id: "budget2" };

      vi.mocked(readdir).mockResolvedValue([
        { name: "dir1", isDirectory: () => true },
        { name: "dir2", isDirectory: () => true },
      ] as any);

      vi.mocked(readFile)
        .mockResolvedValueOnce(JSON.stringify(mockMetadata1))
        .mockResolvedValueOnce(JSON.stringify(mockMetadata2));

      const result = await getSyncIdMaps("/test/data");

      expect(readFile).toHaveBeenCalledWith(
        "/test/data/dir1/metadata.json",
        "utf-8"
      );
      expect(readFile).toHaveBeenCalledWith(
        "/test/data/dir2/metadata.json",
        "utf-8"
      );
      expect(result).toEqual({
        sync1: "budget1",
        sync2: "budget2",
      });
    });

    it("should handle metadata parsing errors", async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: "dir1", isDirectory: () => true },
      ] as any);
      vi.mocked(readFile).mockResolvedValue("invalid json");

      await expect(getSyncIdMaps("/test/data")).rejects.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });

    it("should handle readFile errors", async () => {
      vi.mocked(readdir).mockResolvedValue([
        { name: "dir1", isDirectory: () => true },
      ] as any);
      vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

      await expect(getSyncIdMaps("/test/data")).rejects.toThrow(
        "File not found"
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("sync", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Mock successful responses by default
      vi.mocked(init).mockResolvedValue(undefined as any);
      vi.mocked(shutdown).mockResolvedValue(undefined);
      vi.mocked(downloadBudget).mockResolvedValue(undefined);
      vi.mocked(loadBudget).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(runBankSync).mockResolvedValue(undefined);
      vi.mocked(syncBudget).mockResolvedValue(undefined);

      // Ensure cronstrue mock returns a valid string
      cronstrueMock.toString.mockReturnValue("every day at midnight");

      // Mock getSyncIdMaps to return a mapping that matches the env.ACTUAL_BUDGET_SYNC_IDS
      vi.mocked(readdir).mockResolvedValue([
        { name: "dir1", isDirectory: () => true },
        { name: "dir2", isDirectory: () => true },
      ] as any);
      vi.mocked(readFile)
        .mockResolvedValueOnce(
          JSON.stringify({ groupId: "budget1", id: "budget1" })
        )
        .mockResolvedValueOnce(
          JSON.stringify({ groupId: "budget2", id: "budget2" })
        );
    });

    it("should complete the sync process successfully", async () => {
      await sync();

      // Verify the main flow was executed
      expect(mkdir).toHaveBeenCalledWith("./data", { recursive: true });
      expect(init).toHaveBeenCalledWith({
        dataDir: "./data",
        serverURL: "http://localhost:5006",
        password: "test-password",
      });
      expect(cronstrueMock.toString).toHaveBeenCalledWith("0 0 * * *");
      expect(shutdown).toHaveBeenCalled();
    });

    it("should handle directory creation errors", async () => {
      const error = new Error("Permission denied");
      vi.mocked(mkdir).mockRejectedValue(error);

      await sync();
      expect(shutdown).toHaveBeenCalled();
    });

    it("should handle Actual API initialization errors", async () => {
      const error = new Error("Connection failed");
      vi.mocked(init).mockRejectedValue(error);

      await sync();
      expect(shutdown).toHaveBeenCalled();
    });

    it("should handle getSyncIdMaps errors", async () => {
      const error = new Error("Failed to read metadata");
      vi.mocked(readFile).mockRejectedValue(error);

      // The function should complete even with errors
      await sync();

      // Should still attempt shutdown
      expect(shutdown).toHaveBeenCalled();
    });

    it("should handle cronstrue formatting errors gracefully", async () => {
      const error = new Error("Invalid cron expression");
      cronstrueMock.toString.mockImplementation(() => {
        throw error;
      });

      await sync();

      // Should continue with the sync process despite cron formatting error
      expect(init).toHaveBeenCalled();
      expect(shutdown).toHaveBeenCalled();
    });
  });
});
