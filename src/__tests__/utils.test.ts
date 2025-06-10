import { mkdir, stat } from "node:fs/promises";

import { describe, it, expect, vi, beforeEach } from "vitest";

import { logger } from "../logger.js";
import { formatCronSchedule, isDirectory, createDirectory } from "../utils.js";

// Mock the fs/promises module
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock the logger
vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe("utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatCronSchedule", () => {
    it("should format cron schedule correctly", () => {
      expect(formatCronSchedule("0 0 * * *")).toBe("at 12:00 AM");
      expect(formatCronSchedule("0 */6 * * *")).toBe(
        "at 0 minutes past the hour, every 6 hours"
      );
      expect(formatCronSchedule("0 0 * * 0")).toBe(
        "at 12:00 AM, only on Sunday"
      );
    });
  });

  describe("isDirectory", () => {
    it("should return true when path is a directory", async () => {
      vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
      const result = await isDirectory("/test/path");
      expect(result).toBe(true);
    });

    it("should return false when path is not a directory", async () => {
      vi.mocked(stat).mockResolvedValueOnce({
        isDirectory: () => false,
      } as any);
      const result = await isDirectory("/test/path");
      expect(result).toBe(false);
    });

    it("should return false when stat fails", async () => {
      vi.mocked(stat).mockRejectedValueOnce(new Error("File not found"));
      const result = await isDirectory("/test/path");
      expect(result).toBe(false);
    });
  });

  describe("createDirectory", () => {
    it("should create directory when it does not exist", async () => {
      vi.mocked(stat).mockRejectedValueOnce(new Error("Directory not found"));
      await createDirectory("/test/path");
      expect(mkdir).toHaveBeenCalledWith("/test/path", { recursive: true });
      expect(logger.info).toHaveBeenCalledWith("Creating directory /test/path");
      expect(logger.info).toHaveBeenCalledWith(
        "Directory created successfully."
      );
    });

    it("should not create directory when it already exists", async () => {
      vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as any);
      await createDirectory("/test/path");
      expect(mkdir).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Using existing directory /test/path."
      );
    });
  });
});
