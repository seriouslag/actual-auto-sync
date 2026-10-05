import type * as ActualApi from '@actual-app/api';
import {
  aqlQuery,
  downloadBudget,
  init,
  runBankSync,
  shutdown,
  sync as syncBudget,
  getAccounts,
} from '@actual-app/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../env.js';
import { readTransactionSnapshot } from '../transaction-snapshot.js';
import { sync } from '../utils.js';

vi.mock('@actual-app/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ActualApi>();
  return {
    ...actual,
    init: vi.fn(),
    downloadBudget: vi.fn(),
    runBankSync: vi.fn(),
    sync: vi.fn(),
    shutdown: vi.fn(),
    getAccounts: vi.fn(),
    aqlQuery: vi.fn(),
  };
});
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
}));
vi.mock('../env.js', () => ({
  env: {
    ACTUAL_SERVER_URL: 'http://actual:5006',
    ACTUAL_SERVER_PASSWORD: 'secret',
    ACTUAL_DATA_DIR: './data',
    CRON_SCHEDULE: '0 1 * * *',
    ACTUAL_BUDGET_SYNC_IDS: ['budget1', 'budget2'],
    ENCRYPTION_PASSWORDS: [],
    LOG_LEVEL: 'warn',
    SKIP_FAILED_ACCOUNTS: false,
    NOTIFICATION_URL: 'http://apprise:8000/notify/budget',
    NOTIFY_ON_FAILURE: true,
    NOTIFY_ON_SUCCESS: false,
    NOTIFY_ON_NEW_UNCATEGORIZED: true,
    NOTIFICATION_TIMEOUT_MS: 10_000,
  },
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  isVerbose: () => false,
}));
const configuration = env as unknown as Record<string, unknown>;
const fetchMock = vi.fn();
const db = { getAccounts: vi.fn(), update: vi.fn() };
const old = {
  id: 'old',
  account: 'checking',
  category: null,
  imported_id: 'bank-old',
  offbudget: false,
};
const fresh = {
  id: 'fresh',
  account: 'checking',
  category: null,
  imported_id: 'bank-new',
  offbudget: false,
};
const payload = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('sync notifications', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    configuration.NOTIFICATION_URL = 'http://apprise:8000/notify/budget';
    configuration.NOTIFY_ON_SUCCESS = false;
    configuration.NOTIFY_ON_NEW_UNCATEGORIZED = true;
    configuration.SKIP_FAILED_ACCOUNTS = false;
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(new Response('', { status: 200 })));
    vi.mocked(init).mockResolvedValue({ db } as unknown as Awaited<ReturnType<typeof init>>);
    vi.mocked(downloadBudget).mockResolvedValue(undefined);
    vi.mocked(runBankSync).mockResolvedValue(undefined);
    vi.mocked(syncBudget).mockResolvedValue(undefined);
    vi.mocked(shutdown).mockResolvedValue(undefined as never);
    db.getAccounts.mockResolvedValue([]);
    db.update.mockResolvedValue(undefined);
    vi.mocked(aqlQuery).mockResolvedValue({ data: [old] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends one success summary for new uncategorized transactions after both budgets and shutdown', async () => {
    vi.mocked(aqlQuery)
      .mockResolvedValueOnce({ data: [old] })
      .mockResolvedValueOnce({ data: [old, fresh] });
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload()).toMatchObject({ type: 'success' });
    expect(payload().body).toContain('1 new uncategorized');
    expect(payload().body).toContain('budget1');
    expect(fetchMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(shutdown).mock.invocationCallOrder[0],
    );
    expect(fetchMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(syncBudget).mock.invocationCallOrder[1],
    );
  });

  it('stays quiet for an existing backlog and repeated syncs', async () => {
    await sync();
    await sync();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not query transactions or deliver anything when disabled', async () => {
    configuration.NOTIFICATION_URL = undefined;
    await sync();
    expect(aqlQuery).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports final budget failure once and includes successful budgets', async () => {
    vi.mocked(downloadBudget)
      .mockRejectedValueOnce(new Error('secret-token'))
      .mockRejectedValueOnce(new Error('secret-token'));
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('failure');
    expect(payload().body).toContain('budget1');
    expect(payload().body).toContain('budget2');
    expect(payload().body).not.toContain('secret-token');
  });

  it('only reports the final success after a recovered retry', async () => {
    configuration.NOTIFY_ON_SUCCESS = true;
    vi.mocked(downloadBudget).mockRejectedValueOnce(new Error('temporary'));
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('success');
  });

  it('retains the original transaction baseline when a push fails and the budget is retried', async () => {
    vi.mocked(syncBudget).mockRejectedValueOnce(new Error('push failed'));
    vi.mocked(aqlQuery)
      .mockResolvedValueOnce({ data: [old] })
      .mockResolvedValue({ data: [old, fresh] });
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().body).toContain('1 new uncategorized');
    expect(payload().type).toBe('success');
  });

  it('reports skipped account failures as a warning and still pushes the budget', async () => {
    configuration.SKIP_FAILED_ACCOUNTS = true;
    vi.mocked(getAccounts).mockResolvedValue([
      { id: 'a', name: 'Checking' },
      { id: 'b', name: 'Savings' },
    ]);
    vi.mocked(runBankSync).mockRejectedValueOnce(new Error('reauth'));
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('warning');
    expect(payload().body).toContain('Checking');
    expect(syncBudget).toHaveBeenCalledTimes(2);
  });

  it('names the accounts needing attention when a batch bank sync fails', async () => {
    vi.mocked(runBankSync).mockRejectedValue(new Error('secret bank error'));
    db.getAccounts.mockResolvedValue([
      { id: 'a', name: 'Checking', closed: 0, bank_sync_status: 'reauth-required' },
      { id: 'b', name: 'Savings', closed: 0, bank_sync_status: 'ok' },
      { id: 'c', name: '', closed: 0, bank_sync_status: 'rate-limit-exceeded' },
      { id: 'd', name: 'Old card', closed: 1, bank_sync_status: 'failed' },
      { id: 'e', name: 'Cash', closed: 0, bank_sync_status: null },
    ]);
    await sync();
    expect(runBankSync).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('failure');
    expect(payload().body).toContain(
      'Accounts needing attention: Checking (re-authentication required), c (rate limit exceeded).',
    );
    expect(payload().body).not.toContain('Savings');
    expect(payload().body).not.toContain('Old card');
    expect(payload().body).not.toContain('Cash');
    expect(payload().body).not.toContain('secret bank error');
  });

  it('still reports a batch bank sync failure when account statuses cannot be read', async () => {
    vi.mocked(runBankSync).mockRejectedValue(new Error('bank down'));
    db.getAccounts.mockRejectedValue(new Error('database'));
    await sync();
    expect(runBankSync).toHaveBeenCalledTimes(4);
    expect(payload().type).toBe('failure');
    expect(payload().body).not.toContain('Accounts needing attention');
  });

  it('clears accounts needing attention when the batch bank sync recovers on retry', async () => {
    configuration.NOTIFY_ON_SUCCESS = true;
    vi.mocked(runBankSync).mockRejectedValueOnce(new Error('temporary'));
    db.getAccounts.mockResolvedValue([
      { id: 'a', name: 'Checking', closed: 0, bank_sync_status: 'timed-out' },
    ]);
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('success');
    expect(payload().body).not.toContain('Accounts needing attention');
  });

  it('reports balance persistence failures without stopping other budgets', async () => {
    db.getAccounts.mockRejectedValueOnce(new Error('database'));
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('warning');
    expect(payload().body).toContain('balances');
    expect(syncBudget).toHaveBeenCalledTimes(2);
  });

  it('reports initialization and shutdown failures', async () => {
    vi.mocked(init).mockRejectedValue(new Error('secret password'));
    vi.mocked(shutdown).mockRejectedValueOnce(new Error('shutdown error'));
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('failure');
    expect(payload().body).toContain('initialization');
    expect(payload().body).toContain('shutdown');
    expect(payload().body).not.toContain('secret password');
  });

  it.each([undefined, null, {}, { data: null }, { data: {} }])(
    'rejects malformed transaction query responses: %j',
    async (response) => {
      vi.mocked(aqlQuery).mockResolvedValue(response);
      await expect(readTransactionSnapshot()).rejects.toThrow(TypeError);
    },
  );

  it('marks malformed transaction results unavailable without retrying bank sync', async () => {
    vi.mocked(aqlQuery).mockResolvedValue({ data: null });
    await sync();
    expect(runBankSync).toHaveBeenCalledTimes(2);
    expect(syncBudget).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('warning');
    expect(payload().body).toContain('count unavailable');
    expect(payload().body).not.toContain('0 new uncategorized');
  });

  it('does not let transaction scanning failures abort bank sync', async () => {
    vi.mocked(aqlQuery).mockRejectedValue(new Error('query unavailable'));
    await sync();
    expect(syncBudget).toHaveBeenCalledTimes(2);
    expect(payload().type).toBe('warning');
    expect(payload().body).toContain('transaction');
  });

  it('logs delivery errors without retrying bank sync', async () => {
    configuration.NOTIFY_ON_SUCCESS = true;
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(sync()).resolves.toBeUndefined();
    expect(runBankSync).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains skipped-account and balance warnings when the final server upload also fails', async () => {
    configuration.SKIP_FAILED_ACCOUNTS = true;
    vi.mocked(getAccounts).mockResolvedValue([{ id: 'a', name: 'Checking' }]);
    vi.mocked(runBankSync).mockRejectedValue(new Error('reauth'));
    db.getAccounts.mockRejectedValue(new Error('balance read'));
    vi.mocked(syncBudget).mockRejectedValue(new Error('push failed'));
    await sync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload().type).toBe('failure');
    expect(payload().body).toContain('Checking');
    expect(payload().body).toContain('balances');
  });
});
