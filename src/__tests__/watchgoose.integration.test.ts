import { afterAll, expect, it, vi } from 'vitest';

/**
 * Live contract test for the heartbeat client against Watchgoose.
 * Pull-request and main CI do not run this file. The weekly workflow does.
 * The read-write project key stays in the WATCHGOOSE_API_KEY Actions secret.
 */

const TAG = 'actual-auto-sync-it';
const POLL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

type WatchgooseCheck = {
  uuid: string;
  status: string;
  started: boolean;
  ping_url: string;
  channels: string;
};

const apiKey = process.env.WATCHGOOSE_API_KEY?.trim() ?? '';

function apiOrigin(): string {
  const configured = process.env.WATCHGOOSE_API_URL?.trim();
  if (!configured) {
    return 'https://watchgoose.com';
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('WATCHGOOSE_API_URL must be an https URL.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('WATCHGOOSE_API_URL must be an https URL.');
  }
  return url.origin;
}

function outcome(status: 'success' | 'partial' | 'failure') {
  return {
    budgets: [
      {
        budgetId: 'integration',
        status,
        failedAccounts: [],
        warnings: [],
        newUncategorizedTransactions: 0,
      },
    ],
    errors: [],
  };
}

async function watchgoose(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, apiOrigin()), {
    ...init,
    headers: {
      'X-Api-Key': apiKey,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    redirect: 'error',
  });
}

function rejectStatus(action: string, status: number): Error {
  if (status === 401) {
    return new Error(`Watchgoose rejected the API key while ${action} (401).`);
  }
  if (status === 403) {
    return new Error(
      `Watchgoose refused the request while ${action} (403). The project may be at its check limit.`,
    );
  }
  return new Error(`Watchgoose ${action} failed with status ${status}.`);
}

async function listTaggedChecks(): Promise<WatchgooseCheck[]> {
  const response = await watchgoose(`/api/v3/checks/?tag=${TAG}`);
  if (!response.ok) {
    throw rejectStatus('listing checks', response.status);
  }
  const body = (await response.json()) as { checks?: WatchgooseCheck[] };
  return body.checks ?? [];
}

async function deleteCheck(uuid: string): Promise<void> {
  const response = await watchgoose(`/api/v3/checks/${uuid}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw rejectStatus('deleting a check', response.status);
  }
}

async function deleteTaggedChecks(): Promise<void> {
  const checks = await listTaggedChecks();
  for (const check of checks) {
    await deleteCheck(check.uuid);
  }
}

async function createCheck(): Promise<WatchgooseCheck> {
  const suffix = crypto.randomUUID();
  const response = await watchgoose('/api/v3/checks/', {
    method: 'POST',
    body: JSON.stringify({
      name: 'actual-auto-sync integration test',
      slug: `actual-auto-sync-it-${suffix}`,
      tags: TAG,
      desc: 'Temporary check created by the actual-auto-sync Watchgoose integration test.',
      timeout: 86_400,
      grace: 3600,
      channels: '',
    }),
  });
  if (!response.ok) {
    throw rejectStatus('creating a check', response.status);
  }
  return (await response.json()) as WatchgooseCheck;
}

async function getCheck(uuid: string): Promise<WatchgooseCheck> {
  const response = await watchgoose(`/api/v3/checks/${uuid}`);
  if (!response.ok) {
    throw rejectStatus('reading a check', response.status);
  }
  return (await response.json()) as WatchgooseCheck;
}

async function waitFor(
  uuid: string,
  ready: (check: WatchgooseCheck) => boolean,
): Promise<WatchgooseCheck> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let latest: WatchgooseCheck | undefined;
  while (Date.now() < deadline) {
    latest = await getCheck(uuid);
    if (ready(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Watchgoose check did not reach the expected state (status=${latest?.status ?? 'unknown'}, started=${String(latest?.started)}).`,
  );
}

function usePingUrl(pingUrl: string): void {
  const ping = new URL(pingUrl);
  const origin = new URL(apiOrigin());
  if (ping.protocol !== 'https:' || ping.host !== origin.host) {
    throw new Error('Watchgoose returned a ping URL on an unexpected host.');
  }
  // env.ts reads these once, on first import. Set them before importing the client.
  // A *_FILE variable would override the URL, so drop any inherited file paths.
  for (const name of [
    'HEARTBEAT_URL_FILE',
    'HEARTBEAT_START_URL_FILE',
    'HEARTBEAT_FAILURE_URL_FILE',
    'HEARTBEAT_METHOD_FILE',
    'HEARTBEAT_TIMEOUT_MS_FILE',
  ]) {
    delete process.env[name];
  }
  process.env.HEARTBEAT_URL = pingUrl;
  process.env.HEARTBEAT_START_URL = `${pingUrl}/start`;
  process.env.HEARTBEAT_FAILURE_URL = `${pingUrl}/fail`;
  process.env.HEARTBEAT_METHOD = 'GET';
  process.env.ACTUAL_SERVER_URL ??= 'http://127.0.0.1:9';
  process.env.ACTUAL_SERVER_PASSWORD ??= 'watchgoose-integration-test';
  process.env.ACTUAL_BUDGET_SYNC_IDS ??= 'watchgoose-integration-test';
}

it('records start, success, and a partial run on a temporary Watchgoose check', async () => {
  if (!apiKey) {
    throw new Error(
      'WATCHGOOSE_API_KEY is required. The Watchgoose integration workflow provides this Actions secret.',
    );
  }

  await deleteTaggedChecks();
  const created = await createCheck();
  try {
    if (!created.uuid || !created.ping_url) {
      throw new Error('Watchgoose create-check response was missing the check id or ping URL.');
    }
    if (created.channels) {
      throw new Error('Temporary check has alert channels. Refusing to send a failure ping.');
    }
    usePingUrl(created.ping_url.replace(/\/$/u, ''));
    // env.ts reads the heartbeat URLs once. Drop a preloaded copy so this check's URLs are used.
    vi.resetModules();
    const { pingHeartbeatResult, pingHeartbeatStart } = await import('../heartbeat.js');

    await pingHeartbeatStart();
    const started = await waitFor(created.uuid, (check) => check.started);
    expect(started.started).toBe(true);

    await pingHeartbeatResult(outcome('success'));
    const up = await waitFor(created.uuid, (check) => check.status === 'up' && !check.started);
    expect(up.status).toBe('up');

    await pingHeartbeatResult(outcome('partial'));
    const down = await waitFor(created.uuid, (check) => check.status === 'down');
    expect(down.status).toBe('down');
  } finally {
    if (created.uuid) {
      await deleteCheck(created.uuid);
    }
  }
});

afterAll(async () => {
  if (!apiKey) {
    return;
  }
  await deleteTaggedChecks();
});
