import { env } from './env.js';
import { logger } from './logger.js';
import { classifySyncResult, type SyncResult } from './notifications.js';

/** One HTTP attempt with a bounded timeout. Never throws and never retries. */
async function pingHeartbeat(url: string | undefined): Promise<void> {
  if (!url) {
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.HEARTBEAT_TIMEOUT_MS);
  // Ping URLs often embed a secret token in the path, query, or userinfo.
  let host = 'invalid-host';
  try {
    host = new URL(url).host;
    const response = await fetch(url, {
      method: env.HEARTBEAT_METHOD,
      signal: controller.signal,
      // A redirect could forward a token embedded in the URL to another host.
      redirect: 'error',
    });
    // Release the body without logging it; some monitors echo the request URL.
    await response.body?.cancel();
    if (!response.ok) {
      logger.warn({ host, status: response.status }, 'Heartbeat ping failed.');
      return;
    }
    logger.debug({ host }, 'Heartbeat ping sent.');
  } catch {
    // Fetch errors can include the full URL. Keep that out of service logs.
    logger.warn(
      { host },
      controller.signal.aborted ? 'Heartbeat ping timed out.' : 'Heartbeat ping failed.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Optional start signal so a monitor can measure how long the run takes. */
export async function pingHeartbeatStart(): Promise<void> {
  await pingHeartbeat(env.HEARTBEAT_START_URL);
}

/**
 * Pings the outcome URL once the run has finished, including shutdown.
 * Full success (Apprise `success`) uses `HEARTBEAT_URL`. Partial runs and hard
 * failures use `HEARTBEAT_FAILURE_URL`. A missing URL is skipped.
 */
export async function pingHeartbeatResult(result: SyncResult): Promise<void> {
  const url =
    classifySyncResult(result) === 'success' ? env.HEARTBEAT_URL : env.HEARTBEAT_FAILURE_URL;
  await pingHeartbeat(url);
}
