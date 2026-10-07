import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../env.js';
import { logger } from '../logger.js';
import { notifySyncResult, type SyncResult } from '../notifications.js';

vi.mock('../env.js', () => ({
  env: {
    NOTIFICATION_URL: 'http://apprise:8000/notify/budget',
    NOTIFY_ON_FAILURE: true,
    NOTIFY_ON_SUCCESS: false,
    NOTIFY_ON_NEW_UNCATEGORIZED: true,
    NOTIFICATION_TIMEOUT_MS: 100,
  },
}));
vi.mock('../logger.js', () => ({ logger: { warn: vi.fn() } }));
const configuration = env as unknown as Record<string, unknown>;
const fetchMock = vi.fn();
const success: SyncResult = {
  budgets: [
    {
      budgetId: 'budget1',
      status: 'success',
      failedAccounts: [],
      warnings: [],
      newUncategorizedTransactions: 0,
    },
  ],
  errors: [],
};

describe('notification delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configuration.NOTIFY_ON_SUCCESS = true;
    configuration.NOTIFY_ON_FAILURE = true;
    configuration.NOTIFY_ON_NEW_UNCATEGORIZED = true;
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(new Response('', { status: 200 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('posts the Apprise JSON contract with an abort signal', async () => {
    await notifySyncResult(success);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://apprise:8000/notify/budget',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
        // Following a redirect could forward the summary to an unintended host.
        redirect: 'error',
      }),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      type: 'success',
      format: 'text',
      title: expect.any(String),
      body: expect.stringContaining('budget1'),
    });
  });

  it('summarizes every budget, account needing attention, warning, and error in a fixed format', async () => {
    await notifySyncResult({
      budgets: [
        { ...success.budgets[0], newUncategorizedTransactions: 3 },
        {
          budgetId: 'budget2',
          status: 'partial',
          failedAccounts: ['Checking (re-authentication required)', 'Savings (rate limited)'],
          warnings: ['Account balances could not be saved.'],
          newUncategorizedTransactions: null,
        },
      ],
      errors: ['API shutdown failed.'],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      title: 'Actual Auto Sync failed',
      type: 'failure',
      format: 'text',
      body: [
        'Actual Auto Sync failed',
        '3 new uncategorized transaction(s) detected in inspected budgets.',
        'Budget budget1: success; 3 new uncategorized transaction(s).',
        'Budget budget2: partial; new transaction count unavailable.',
        'Accounts needing attention: Checking (re-authentication required), Savings (rate limited).',
        'Account balances could not be saved.',
        'API shutdown failed.',
      ].join('\n'),
    });
  });

  it('labels partial runs as warnings', async () => {
    await notifySyncResult({
      budgets: [
        { ...success.budgets[0], status: 'partial', failedAccounts: ['Checking (failed)'] },
      ],
      errors: [],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      title: 'Actual Auto Sync completed with warnings',
      type: 'warning',
    });
  });

  it('does not claim zero new transactions when transaction inspection was disabled', async () => {
    await notifySyncResult({
      budgets: [{ ...success.budgets[0], newUncategorizedTransactions: null }],
      errors: [],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body).body;
    expect(body).not.toContain('0 new uncategorized');
    expect(body).toContain('count unavailable');
  });

  it('can disable all event types', async () => {
    configuration.NOTIFY_ON_SUCCESS = false;
    configuration.NOTIFY_ON_FAILURE = false;
    configuration.NOTIFY_ON_NEW_UNCATEGORIZED = false;
    await notifySyncResult({ ...success, errors: ['initialization failed'] });
    await notifySyncResult(success);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps failure severity when new transactions trigger an alert with failure alerts disabled', async () => {
    configuration.NOTIFY_ON_SUCCESS = false;
    configuration.NOTIFY_ON_FAILURE = false;
    await notifySyncResult({
      budgets: [{ ...success.budgets[0], newUncategorizedTransactions: 2 }],
      errors: ['shutdown failed'],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).type).toBe('failure');
  });

  it('logs non-success HTTP responses without exposing endpoint credentials or response bodies', async () => {
    fetchMock.mockResolvedValue(new Response('secret response', { status: 503 }));
    await expect(notifySyncResult(success)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('secret response');
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('http://apprise');
  });

  it('logs connection errors as delivery failures without exposing endpoint credentials', async () => {
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed', {
        cause: new Error('getaddrinfo ENOTFOUND http://user:secret@apprise:8000'),
      }),
    );
    await expect(notifySyncResult(success)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('Notification delivery failed.');
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('secret');
  });

  it('aborts delivery at the configured timeout and resolves without throwing', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
        }),
    );
    const pending = notifySyncResult(success);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith('Notification delivery timed out.');
  });
});
