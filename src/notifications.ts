import { env } from './env.js';
import { logger } from './logger.js';

export interface BudgetSyncResult {
  budgetId: string;
  status: 'success' | 'partial' | 'failure';
  failedAccounts: string[];
  warnings: string[];
  newUncategorizedTransactions: number | null;
}

export interface SyncResult {
  budgets: BudgetSyncResult[];
  errors: string[];
}

type NotificationType = 'failure' | 'warning' | 'success';
const titles: Record<NotificationType, string> = {
  failure: 'Actual Auto Sync failed',
  warning: 'Actual Auto Sync completed with warnings',
  success: 'Actual Auto Sync completed',
};

/** Builds a text summary using only counts, budget IDs, account labels, and sanitized warnings. */
function notificationPayload(result: SyncResult, type: NotificationType, newTransactions: number) {
  const title = titles[type];
  const lines = [title];
  if (result.budgets.some((budget) => budget.newUncategorizedTransactions !== null)) {
    lines.push(
      `${newTransactions} new uncategorized transaction(s) detected in inspected budgets.`,
    );
  }
  for (const budget of result.budgets) {
    const count =
      budget.newUncategorizedTransactions === null
        ? 'new transaction count unavailable'
        : `${budget.newUncategorizedTransactions} new uncategorized transaction(s)`;
    lines.push(`Budget ${budget.budgetId}: ${budget.status}; ${count}.`);
    if (budget.failedAccounts.length > 0) {
      lines.push(`Failed accounts: ${budget.failedAccounts.join(', ')}.`);
    }
    lines.push(...budget.warnings);
  }
  lines.push(...result.errors);
  return { title, body: lines.join('\n'), type, format: 'text' };
}

/** Sends at most one summary after the full run, independently of bank-sync retries. */
export async function notifySyncResult(result: SyncResult): Promise<void> {
  if (!env.NOTIFICATION_URL) {
    return;
  }
  const failed =
    result.errors.length > 0 || result.budgets.some((budget) => budget.status === 'failure');
  const partial = result.budgets.some((budget) => budget.status === 'partial');
  const newTransactions = result.budgets.reduce(
    (total, budget) => total + (budget.newUncategorizedTransactions ?? 0),
    0,
  );
  const shouldNotify =
    ((failed || partial) && env.NOTIFY_ON_FAILURE) ||
    (!failed && !partial && env.NOTIFY_ON_SUCCESS) ||
    (newTransactions > 0 && env.NOTIFY_ON_NEW_UNCATEGORIZED);
  if (!shouldNotify) {
    return;
  }

  let type: NotificationType = 'success';
  if (failed) {
    type = 'failure';
  } else if (partial) {
    type = 'warning';
  }
  await deliverNotification(
    env.NOTIFICATION_URL,
    notificationPayload(result, type, newTransactions),
  );
}

/** Posts one summary with a bounded timeout; delivery errors are logged without exposing the endpoint. */
async function deliverNotification(
  url: string,
  payload: ReturnType<typeof notificationPayload>,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.NOTIFICATION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'error',
    });
    // Release the response without logging its potentially sensitive contents.
    await response.body?.cancel();
    if (!response.ok) {
      logger.warn({ status: response.status }, 'Notification delivery failed.');
    }
  } catch {
    // Fetch errors can include endpoint credentials. Keep those out of service logs.
    logger.warn(
      controller.signal.aborted
        ? 'Notification delivery timed out.'
        : 'Notification delivery failed.',
    );
  } finally {
    clearTimeout(timeout);
  }
}
