/**
 * E2E Tests for Apprise notifications
 *
 * Delivers sync summaries through a real Apprise API container and checks what
 * reaches the destination Apprise relays to:
 * 1. Start a local HTTP receiver
 * 2. Save an Apprise configuration whose destination is a json:// URL pointing at the receiver
 * 3. Call notifySyncResult with NOTIFICATION_URL set to the saved configuration
 * 4. Assert the relayed title, message, and type
 *
 * Requires APPRISE_URL (set by docker-compose.e2e.yml). APPRISE_CALLBACK_HOST is the
 * hostname Apprise uses to reach this test process.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

import { logger } from '../../logger.js';
import type { SyncResult } from '../../notifications.js';

const APPRISE_URL = process.env.APPRISE_URL;
const CALLBACK_HOST = process.env.APPRISE_CALLBACK_HOST || 'host.docker.internal';
const CONFIG_KEY = `actual-auto-sync-e2e-${Date.now()}`;

/** Body Apprise's json:// plugin posts to its destination. */
interface RelayedNotification {
  title: string;
  message: string;
  type: string;
}

const result = (status: 'success' | 'partial' | 'failure', errors: string[] = []): SyncResult => ({
  budgets: [
    {
      budgetId: 'e2e-budget',
      status,
      failedAccounts: status === 'success' ? [] : ['Checking (re-authentication required)'],
      warnings: [],
      newUncategorizedTransactions: 2,
    },
  ],
  errors,
});

async function readJson(request: IncomingMessage): Promise<RelayedNotification> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }
  return JSON.parse(body);
}

async function apprise(path: string, body: unknown): Promise<Response> {
  return fetch(`${APPRISE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!APPRISE_URL)('E2E: Apprise notifications', () => {
  let receiver: Server;
  const relayed: RelayedNotification[] = [];
  let notifySyncResult: (result: SyncResult) => Promise<void>;
  let warn: MockInstance<typeof logger.warn>;

  beforeAll(async () => {
    receiver = createServer(async (request, response) => {
      relayed.push(await readJson(request));
      response.end();
    });
    await new Promise<void>((resolve) => receiver.listen(0, '0.0.0.0', resolve));
    const address = receiver.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Notification receiver is not listening on a TCP port.');
    }

    const saved = await apprise(`/add/${CONFIG_KEY}`, {
      urls: `json://${CALLBACK_HOST}:${address.port}/`,
    });
    expect(saved.status).toBe(200);

    // env.ts validates process.env on import, so configure it before loading the module.
    process.env.NOTIFICATION_URL = `${APPRISE_URL}/notify/${CONFIG_KEY}`;
    process.env.NOTIFY_ON_SUCCESS = 'true';
    process.env.ACTUAL_BUDGET_SYNC_IDS ??= 'e2e-budget';
    ({ notifySyncResult } = await import('../../notifications.js'));
    // Spy only after env.ts sets the log level: pino rebinds its level methods on every change.
    warn = vi.spyOn(logger, 'warn');
  });

  beforeEach(() => {
    relayed.length = 0;
    warn.mockClear();
  });

  afterAll(async () => {
    await apprise(`/del/${CONFIG_KEY}`, {}).catch(() => {});
    await new Promise((resolve) => receiver.close(resolve));
  });

  it.each([
    ['failure', result('failure', ['API shutdown failed.']), 'Actual Auto Sync failed'],
    ['warning', result('partial'), 'Actual Auto Sync completed with warnings'],
    ['success', result('success'), 'Actual Auto Sync completed'],
  ] as const)('relays a %s summary to the Apprise destination', async (type, syncResult, title) => {
    await notifySyncResult(syncResult);

    // Apprise relays synchronously before answering, so the receiver already has it.
    expect(warn).not.toHaveBeenCalled();
    expect(relayed).toHaveLength(1);
    expect(relayed[0]).toMatchObject({ title, type });
    expect(relayed[0].message).toContain('Budget e2e-budget:');
    expect(relayed[0].message).toContain('2 new uncategorized transaction(s)');
    if (type !== 'success') {
      expect(relayed[0].message).toContain('Checking (re-authentication required)');
    }
  });

  it('logs a warning without throwing when the Apprise configuration is missing', async () => {
    const removed = await apprise(`/del/${CONFIG_KEY}`, {});
    expect(removed.status).toBe(200);

    await expect(notifySyncResult(result('failure'))).resolves.toBeUndefined();

    expect(relayed).toHaveLength(0);
    expect(warn).toHaveBeenCalledExactlyOnceWith({ status: 404 }, 'Notification delivery failed.');
  });
});
