import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  init,
  shutdown,
  runBankSync,
  downloadBudget,
  loadBudget,
  getAccounts,
} from "@actual-app/api";
import cron from "node-cron";
import sqlite3 from "better-sqlite3";

import { env } from "./env.js";
import { logger } from "./logger.js";
import {
  createDirectory,
  formatCronSchedule,
  listSubDirectories,
} from "./utils.js";
import { Logger } from "pino";

const BUDGET_DIR = join(env.ACTUAL_DATA_DIR, "budgets");

async function syncAllAccounts(db: sqlite3.Database | null, syncIds: string[]) {
  try {
    logger.info("Syncing all accounts...");

    const accounts = await getAccounts();

    const saveSyncStatusStmt = db?.prepare(
      `INSERT INTO sync_history (sync_id, budget_id, account_id, account_name, synced_started_at, synced_finished_at, synced_duration, synced_error, synced_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`
    );

    const saveSyncStatus = ({
      syncId,
      budgetId,
      accountId,
      accountName,
      lastSyncedStartedAt,
      lastSyncedFinishedAt,
      lastSyncDuration,
      lastSyncError,
      lastSyncStatus,
    }: {
      syncId: string;
      budgetId: string;
      accountId: string;
      accountName: string;
      lastSyncedStartedAt: string;
      lastSyncedFinishedAt: string | null;
      lastSyncDuration: number;
      lastSyncError: string | null;
      lastSyncStatus: string;
    }) => {
      if (!saveSyncStatusStmt) {
        return;
      }
      try {
        saveSyncStatusStmt.run(
          syncId,
          budgetId,
          accountId,
          accountName,
          lastSyncedStartedAt,
          lastSyncedFinishedAt,
          lastSyncDuration,
          lastSyncError,
          lastSyncStatus
        );
      } catch (err) {
        logger.error(err, "Error saving sync status");
        throw err;
      }
    };

    const budgetIdToSyncId = await getSyncIdMaps(BUDGET_DIR);

    // loop through syncIds and sync all accounts for each syncId
    const tasks = syncIds.flatMap((syncId) =>
      accounts.map(async (account) => {
        const startTime = Date.now();
        logger.info(`Syncing account ${account.name}...`);
        const budgetId = budgetIdToSyncId[syncId];
        const lastSyncedStartedAt = new Date().toISOString();
        saveSyncStatus({
          syncId,
          budgetId,
          accountId: account.id,
          accountName: account.name,
          lastSyncedStartedAt,
          lastSyncedFinishedAt: null,
          lastSyncDuration: 0,
          lastSyncError: "",
          lastSyncStatus: "syncing",
        });
        try {
          await runBankSync({
            accountId: account.id,
          });
          const endTime = Date.now();
          const duration = endTime - startTime;
          const lastSyncedFinishedAt = new Date().toISOString();
          saveSyncStatus({
            syncId,
            budgetId,
            accountId: account.id,
            accountName: account.name,
            lastSyncedStartedAt,
            lastSyncedFinishedAt,
            lastSyncDuration: duration,
            lastSyncError: "",
            lastSyncStatus: "success",
          });
          logger.info(
            `Account ${account.name} synced successfully in ${duration}ms.`
          );
        } catch (err) {
          const endTime = Date.now();
          const duration = endTime - startTime;
          const lastSyncedFinishedAt = new Date().toISOString();
          const errorMessage = err instanceof Error ? err.message : String(err);
          saveSyncStatus({
            syncId,
            budgetId,
            accountId: account.id,
            accountName: account.name,
            lastSyncedStartedAt,
            lastSyncedFinishedAt,
            lastSyncDuration: duration,
            lastSyncError: errorMessage,
            lastSyncStatus: "error",
          });
          logger.warn(`Error syncing account ${account.name}`);
        }
      })
    );
    await Promise.allSettled(tasks);
    logger.info("All accounts synced.");
  } catch (err) {
    logger.error(err, "Error syncing all accounts");
  }
}

function setupDatabase(db: sqlite3.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id TEXT,
    budget_id TEXT,
    account_id TEXT,
    account_name TEXT,
    synced_started_at TEXT,
    synced_finished_at TEXT NULL,
    synced_duration INTEGER,
    synced_error TEXT NULL,
    synced_status TEXT,
    CHECK (synced_status IN ('syncing', 'success', 'error'))
  )`);
}

function setupCronJob(
  schedule: string,
  db: sqlite3.Database | null,
  syncIds: string[]
) {
  const formattedSchedule = formatCronSchedule(schedule);
  logger.info(`Scheduling sync to run ${formattedSchedule}...`);
  cron.schedule(
    schedule,
    () => {
      logger.info(
        `Running scheduled cron job, the schedule is to run ${formattedSchedule}.`
      );
      try {
        syncAllAccounts(db, syncIds);
      } catch (err) {
        logger.error(
          err,
          "Error syncing all accounts. Will retry with next cron job."
        );
      }
    },
    {
      noOverlap: true,
    }
  );
  logger.info("Sync scheduled successfully.");
}

/**
 * Loads and downloads budgets to and from the budgets directory.
 * This function is needed before the cron job fires.
 */
async function loadAndDownloadBudgets({
  budgetsDir,
  syncIds,
}: {
  budgetsDir: string;
  syncIds: string[];
}) {
  const syncIdToBudgetId = await getSyncIdMaps(budgetsDir);
  const tasks: Promise<void>[] = [];
  for (const [syncId, budgetId] of Object.entries(syncIdToBudgetId)) {
    // Skip loading if the sync id is not in the ACTUAL_BUDGET_SYNC_IDS array
    if (!syncIds.includes(syncId)) {
      continue;
    }
    tasks.push(handleLoadBudget(budgetId));
  }
  for (const syncId of syncIds) {
    // skip downloading if the syncId id is already loaded
    const budgetId = syncIdToBudgetId[syncId];
    if (budgetId) {
      continue;
    }
    tasks.push(handleDownloadBudget(syncId));
  }
  if (tasks.length === 0) {
    logger.error("No budgets to load or download. Exiting...");
    throw new Error("No budgets to load or download.");
  }
  await Promise.allSettled(tasks);
}

async function handleLoadBudget(budgetId: string) {
  try {
    logger.info(`Loading budget ${budgetId}...`);
    await loadBudget(budgetId);
    logger.info(`Budget ${budgetId} loaded successfully.`);
  } catch (err) {
    logger.error(err, `Error loading budget ${budgetId}`);
  }
}

async function handleDownloadBudget(syncId: string) {
  try {
    logger.info(`Downloading budget ${syncId}...`);
    await downloadBudget(syncId);
    logger.info(`Budget ${syncId} downloaded successfully.`);
  } catch (err) {
    logger.error(err, `Error downloading budget ${syncId}`);
  }
}

async function getSyncIdMaps(budgetsDir: string) {
  logger.info("Getting sync id to budget id map...");
  // Unfortunately Actual Node.js api doesn't provide functionality to get the
  // budget id associated to the sync id, this is a hack to do that
  try {
    const directories = await listSubDirectories(budgetsDir);
    const syncIdToBudgetId: Record<string, string> = {};
    const tasks = directories.map(async (subDir) => {
      const metadata = JSON.parse(
        await readFile(join(budgetsDir, subDir, "metadata.json"), "utf-8")
      );
      syncIdToBudgetId[metadata.groupId] = metadata.id;
    });
    await Promise.allSettled(tasks);
    logger.info("Sync id to budget id map created successfully.");
    return syncIdToBudgetId;
  } catch (err) {
    logger.error("Error creating map from sync id to budget id", err);
    throw err;
  }
}

class BudgetSyncService {
  private db: sqlite3.Database | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly syncIds: string[],
    private readonly serverURL: string,
    private readonly password: string,
    private readonly schedule: string,
    private readonly logger: Logger,
    private readonly enableHistory: boolean
  ) {
    this.dataDir = dataDir;
    this.syncIds = syncIds;
    this.serverURL = serverURL;
    this.password = password;
    this.schedule = schedule;
    this.logger = logger;
    this.enableHistory = enableHistory;
  }

  async start() {
    logger.info("Starting service...");

    await createDirectory(this.dataDir);
    const budgetsDir = join(this.dataDir, "budgets");
    await createDirectory(budgetsDir);

    const dataDir = resolve(this.dataDir);

    if (this.enableHistory) {
      this.db = new sqlite3(join(dataDir, "actual.db"));
    }
    try {
      if (this.enableHistory && this.db) {
        setupDatabase(this.db);
      }
      this.logger.info("Initializing Actual API...");
      await init({
        dataDir: budgetsDir,
        serverURL: this.serverURL,
        password: this.password,
      });
      this.logger.info("Actual API initialized successfully.");

      await loadAndDownloadBudgets({
        budgetsDir,
        syncIds: this.syncIds,
      });

      setupCronJob(this.schedule, this.db, this.syncIds);
    } catch (err) {
      this.logger.error(err, "Error starting the service. Shutting down...");
      await this.stop();
    }
  }

  async stop() {
    await shutdown();
    this.db?.close();
    this.logger.info("Shutdown complete. Exiting...");
    process.exit(0);
  }
}

const service = new BudgetSyncService(
  env.ACTUAL_DATA_DIR,
  env.ACTUAL_BUDGET_SYNC_IDS,
  env.ACTUAL_SERVER_URL,
  env.ACTUAL_SERVER_PASSWORD,
  env.CRON_SCHEDULE,
  logger,
  env.ENABLE_HISTORY
);

// Handle uncaught exceptions
// This is needed to catch sync errors inside the budget sync API, they are not caught by try catch.
process.on("uncaughtException", (err) => {
  logger.error(new Date().toUTCString() + " uncaughtException:", err.message);
});

service.start();
