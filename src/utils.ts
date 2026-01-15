import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  init,
  shutdown,
  runBankSync,
  downloadBudget,
  loadBudget,
  sync as syncBudget,
} from "@actual-app/api";
import cronstrue from "cronstrue";

import { env } from "./env.js";
import { logger } from "./logger.js";

const ACTUAL_DATA_DIR = "./data";

export function formatCronSchedule(schedule: string) {
  return cronstrue.toString(schedule).toLowerCase();
}

export async function syncAllAccounts() {
  try {
    logger.info("Syncing all accounts...");
    await runBankSync();
    logger.info("All accounts synced.");
    logger.info("Syncing budget to server...");
    await syncBudget();
    logger.info("Budget synced to server successfully.");
  } catch (err) {
    logger.error({ err }, "Error syncing all accounts");
  }
}

export const sync = async () => {
  logger.info("Starting service...");
  try {
    logger.info(`Creating data directory ${ACTUAL_DATA_DIR}`);
    await mkdir(ACTUAL_DATA_DIR, { recursive: true });
    logger.info("Data directory created successfully.");
    logger.info("Initializing Actual API...");
    await init({
      dataDir: ACTUAL_DATA_DIR,
      serverURL: env.ACTUAL_SERVER_URL,
      password: env.ACTUAL_SERVER_PASSWORD,
    });
    logger.info("Actual API initialized successfully.");

    const formattedSchedule = formatCronSchedule(env.CRON_SCHEDULE);
    logger.info(`Scheduling sync to run ${formattedSchedule}...`);

    // Process each budget sequentially to avoid concurrent API access issues
    for (let index = 0; index < env.ACTUAL_BUDGET_SYNC_IDS.length; index++) {
      const budgetId = env.ACTUAL_BUDGET_SYNC_IDS[index];
      try {
        logger.info(`Downloading budget ${budgetId}...`);
        const password = env.ENCRYPTION_PASSWORDS[index];
        if (password) {
          await downloadBudget(budgetId, { password });
        } else {
          await downloadBudget(budgetId);
        }
        logger.info(`Budget ${budgetId} downloaded successfully.`);

        // After downloading, load the budget
        logger.info(`Loading budget ${budgetId}...`);
        await loadBudget(budgetId);
        logger.info(`Budget ${budgetId} loaded successfully.`);

        // Sync accounts for this budget
        logger.info(`Syncing accounts for budget ${budgetId}...`);
        await syncAllAccounts();
        logger.info(`Accounts synced successfully for budget ${budgetId}.`);
      } catch (err) {
        logger.error({ err }, `Error processing budget ${budgetId}`);
      }
    }
  } catch (err) {
    logger.error({ err }, "Error starting the service.");
  } finally {
    logger.info("Shutting down...");
    await shutdown();
    logger.info("Shutdown complete.");
  }
};

export async function listSubDirectories(directory: string) {
  const subDirectories = await readdir(directory, { withFileTypes: true });
  return subDirectories
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

export async function getSyncIdMaps(dataDir: string) {
  logger.info("Getting sync id to budget id map...");
  // Unfortunately Actual Node.js api doesn't provide functionality to get the
  // budget id associated to the sync id, this is a hack to do that
  try {
    const directories = await listSubDirectories(dataDir);
    const syncIdToBudgetId: Record<string, string> = {};
    const tasks = directories.map(async (subDir) => {
      const metadata = JSON.parse(
        await readFile(join(dataDir, subDir, "metadata.json"), "utf-8")
      );
      syncIdToBudgetId[metadata.groupId] = metadata.id;
    });
    await Promise.all(tasks);
    logger.info("Sync id to budget id map created successfully.");
    return syncIdToBudgetId;
  } catch (err) {
    logger.error({ err }, "Error creating map from sync id to budget id");
    throw err;
  }
}
