import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  init,
  shutdown,
  runBankSync,
  downloadBudget,
  loadBudget,
} from "@actual-app/api";
import cronstrue from "cronstrue";
import { CronJob } from "cron";

import { env } from "./env.js";
import { logger } from "./logger.js";

const ACTUAL_DATA_DIR = "./data";

// Global error handlers to catch uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error(error, "Uncaught Exception occurred");
});

// These are needed because @actual-app/api throws an unhandled rejection that is not caught by try/catch
process.on("unhandledRejection", (reason, promise) => {
  logger.error(
    reason,
    "Unhandled Rejection at Promise; This may be okay to ignore.",
    { promise }
  );
});

function formatCronSchedule(schedule: string) {
  return cronstrue.toString(schedule).toLowerCase();
}

async function syncAllAccounts() {
  try {
    logger.info("Syncing all accounts...");
    await runBankSync();
    logger.info("All accounts synced.");
  } catch (err) {
    logger.error(err, "Error syncing all accounts");
  }
}

const start = async () => {
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

    const syncIdToBudgetId = await getSyncIdMaps(ACTUAL_DATA_DIR);

    const tasks = Object.entries(syncIdToBudgetId).map(
      async ([syncId, budgetId]) => {
        // If the sync id is not in the ACTUAL_BUDGET_SYNC_IDS array, skip it
        if (!(syncId in env.ACTUAL_BUDGET_SYNC_IDS)) {
          logger.info(
            `Sync id ${syncId} not in ACTUAL_BUDGET_SYNC_IDS, skipping...`
          );
          return;
        }
        logger.info(`Sync id: ${syncId}, Budget id: ${budgetId}`);
        const syncBudgetId = syncIdToBudgetId[syncId];
        try {
          logger.info(`Loading budget ${syncBudgetId}...`);
          await loadBudget(syncBudgetId);
          logger.info(`Budget ${syncBudgetId} loaded successfully.`);
        } catch (err) {
          logger.error(err, `Error loading budget ${syncBudgetId}`);
        }
      }
    );
    const syncTasks = env.ACTUAL_BUDGET_SYNC_IDS.map(
      async (budgetId, index) => {
        try {
          logger.info(`Downloading budget ${budgetId}...`);
          const password = env.ENCRYPTION_PASSWORDS[index];
          if (password) {
            await downloadBudget(budgetId, { password });
          } else {
            await downloadBudget(budgetId);
          }
          logger.info(`Budget ${budgetId} downloaded successfully.`);
        } catch (err) {
          logger.error(err, `Error downloading budget ${budgetId}`);
        }
      }
    );
    await Promise.all([...tasks, ...syncTasks]);
    try {
      logger.info("Syncing accounts...");
      await syncAllAccounts();
      logger.info("Accounts synced successfully.");
    } catch (err) {
      logger.error(err, "Error in syncing accounts.");
    }
  } catch (err) {
    logger.error(err, "Error starting the service.");
  } finally {
    logger.info("Shutting down...");
    await shutdown();
    logger.info("Shutdown complete.");
  }
};
const cronJob = new CronJob(
  env.CRON_SCHEDULE,
  async () => {
    await start().catch((err) => {
      logger.error(err, "Error starting the service. Shutting down...");
      shutdown().then(() => {
        logger.info("Shutdown complete.");
      });
    });
  },
  () => {
    logger.info(`Cron job completed. Next run is in ${cronJob.nextDate()}.`);
  },
  true,
  env.TIMEZONE
);
logger.info(
  `Cron job started. The schedule is to run ${formatCronSchedule(
    env.CRON_SCHEDULE
  )}. Next run is in ${cronJob.nextDate()}.`
);

async function listSubDirectories(directory: string) {
  const subDirectories = await readdir(directory, { withFileTypes: true });
  return subDirectories
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

async function getSyncIdMaps(dataDir: string) {
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
    logger.error("Error creating map from sync id to budget id", err);
    throw err;
  }
}
