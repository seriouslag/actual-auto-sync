import {
  downloadBudget,
  getAccounts,
  init,
  runBankSync,
  shutdown,
  sync as syncBudget,
} from '@actual-app/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../env.js';
import { logger } from '../logger.js';
import { sync } from '../utils.js';

vi.mock('@actual-app/api', () => ({
  init: vi.fn(),
  shutdown: vi.fn(),
  runBankSync: vi.fn(),
  getAccounts: vi.fn(),
  downloadBudget: vi.fn(),
  sync: vi.fn(),
  aqlQuery: vi.fn(),
  q: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn().mockResolvedValue([]),
}));
vi.mock('../env.js', () => ({
  env: {
    ACTUAL_SERVER_URL: 'http://localhost:5006',
    ACTUAL_SERVER_PASSWORD: 'test-password',
    ACTUAL_DATA_DIR: './data',
    CRON_SCHEDULE: '0 1 * * *',
    ACTUAL_BUDGET_SYNC_IDS: ['budget1'],
    ENCRYPTION_PASSWORDS: [],
    LOG_LEVEL: 'info',
    SKIP_FAILED_ACCOUNTS: false,
    NOTIFICATION_URL: undefined,
    NOTIFY_ON_FAILURE: true,
    NOTIFY_ON_SUCCESS: false,
    NOTIFY_ON_NEW_UNCATEGORIZED: false,
    NOTIFICATION_TIMEOUT_MS: 10_000,
    HEARTBEAT_URL: undefined,
    HEARTBEAT_FAILURE_URL: undefined,
    HEARTBEAT_START_URL: undefined,
    HEARTBEAT_METHOD: 'GET',
    HEARTBEAT_TIMEOUT_MS: 10_000,
  },
}));
vi.mock('../logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  isVerbose: () => false,
}));

const configuration = env as unknown as Record<string, unknown>;
const fetchMock = vi.fn();
const SECRET = 'secret-token';
const SUCCESS_URL = `https://user:${SECRET}@hc-ping.com/${SECRET}`;
const FAILURE_URL = `https://user:${SECRET}@hc-ping.com/${SECRET}/fail`;
const START_URL = `https://user:${SECRET}@hc-ping.com/${SECRET}/start`;
const db = { getAccounts: vi.fn(), update: vi.fn() };
const pingedUrls = () => fetchMock.mock.calls.map((call) => call[0]);

function expectLogsOmitSecret() {
  const logged = JSON.stringify({
    debug: vi.mocked(logger.debug).mock.calls,
    info: vi.mocked(logger.info).mock.calls,
    warn: vi.mocked(logger.warn).mock.calls,
    error: vi.mocked(logger.error).mock.calls,
  });
  expect(logged).not.toContain(SECRET);
  expect(logged).not.toContain('hc-ping.com/');
}

describe('heartbeat monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configuration.HEARTBEAT_URL = undefined;
    configuration.HEARTBEAT_FAILURE_URL = undefined;
    configuration.HEARTBEAT_START_URL = undefined;
    configuration.HEARTBEAT_METHOD = 'GET';
    configuration.HEARTBEAT_TIMEOUT_MS = 10_000;
    configuration.NOTIFICATION_URL = undefined;
    configuration.SKIP_FAILED_ACCOUNTS = false;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(init).mockResolvedValue({ db } as unknown as Awaited<ReturnType<typeof init>>);
    vi.mocked(downloadBudget).mockResolvedValue(undefined);
    vi.mocked(runBankSync).mockResolvedValue(undefined);
    vi.mocked(syncBudget).mockResolvedValue(undefined);
    vi.mocked(shutdown).mockResolvedValue(undefined as never);
    vi.mocked(getAccounts).mockResolvedValue([]);
    db.getAccounts.mockResolvedValue([]);
    db.update.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pings the success URL after a fully successful run', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_FAILURE_URL = FAILURE_URL;
    await sync();
    expect(pingedUrls()).toEqual([SUCCESS_URL]);
    expect(fetchMock).toHaveBeenCalledWith(
      SUCCESS_URL,
      expect.objectContaining({
        method: 'GET',
        signal: expect.any(AbortSignal),
        redirect: 'error',
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(fetchMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(shutdown).mock.invocationCallOrder[0],
    );
    expect(logger.debug).toHaveBeenCalledWith({ host: 'hc-ping.com' }, 'Heartbeat ping sent.');
    expectLogsOmitSecret();
  });

  it('pings the failure URL when a budget fails after retries', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_FAILURE_URL = FAILURE_URL;
    vi.mocked(downloadBudget).mockRejectedValue(new Error('Download failed'));
    await expect(sync()).resolves.toBeUndefined();
    expect(downloadBudget).toHaveBeenCalledTimes(2);
    expect(pingedUrls()).toEqual([FAILURE_URL]);
    expect(shutdown).toHaveBeenCalled();
    expectLogsOmitSecret();
  });

  it('pings the success URL when a retry recovers', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_FAILURE_URL = FAILURE_URL;
    vi.mocked(downloadBudget).mockRejectedValueOnce(new Error('temporary'));
    await sync();
    expect(downloadBudget).toHaveBeenCalledTimes(2);
    expect(pingedUrls()).toEqual([SUCCESS_URL]);
  });

  it('pings the failure URL for a partial per-account run', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_FAILURE_URL = FAILURE_URL;
    configuration.SKIP_FAILED_ACCOUNTS = true;
    vi.mocked(getAccounts).mockResolvedValue([
      { id: 'checking', name: 'Checking', closed: false },
    ] as Awaited<ReturnType<typeof getAccounts>>);
    vi.mocked(runBankSync).mockRejectedValue(new Error('bank down'));
    await expect(sync()).resolves.toBeUndefined();
    expect(pingedUrls()).toEqual([FAILURE_URL]);
    expect(syncBudget).toHaveBeenCalled();
  });

  it('pings the failure URL when API shutdown fails', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_FAILURE_URL = FAILURE_URL;
    vi.mocked(shutdown).mockRejectedValueOnce(new Error('shutdown failed'));
    await expect(sync()).resolves.toBeUndefined();
    expect(pingedUrls()).toEqual([FAILURE_URL]);
  });

  it('pings the start URL before sync work and the success URL after shutdown', async () => {
    configuration.HEARTBEAT_START_URL = START_URL;
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_FAILURE_URL = FAILURE_URL;
    await sync();
    expect(pingedUrls()).toEqual([START_URL, SUCCESS_URL]);
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(downloadBudget).mock.invocationCallOrder[0],
    );
    expect(fetchMock.mock.invocationCallOrder[1]).toBeGreaterThan(
      vi.mocked(shutdown).mock.invocationCallOrder[0],
    );
    expect(logger.debug).toHaveBeenCalledWith({ host: 'hc-ping.com' }, 'Heartbeat ping sent.');
    expectLogsOmitSecret();
  });

  it('makes no requests when heartbeat URLs are unset', async () => {
    await sync();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runBankSync).toHaveBeenCalled();
  });

  it('skips the outcome ping when a failed run has no failure URL', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    vi.mocked(downloadBudget).mockRejectedValue(new Error('Download failed'));
    await expect(sync()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('completes the sync when a heartbeat times out', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_TIMEOUT_MS = 50;
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
        }),
    );
    const pending = sync();
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(runBankSync).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({ host: 'hc-ping.com' }, 'Heartbeat ping timed out.');
    expectLogsOmitSecret();
  });

  it('completes the sync when a heartbeat request fails', async () => {
    configuration.HEARTBEAT_START_URL = START_URL;
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed', {
        cause: new Error(`connect ECONNREFUSED ${SUCCESS_URL}`),
      }),
    );
    await expect(sync()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(runBankSync).toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({ host: 'hc-ping.com' }, 'Heartbeat ping failed.');
    expect(logger.debug).not.toHaveBeenCalled();
    expectLogsOmitSecret();
  });

  it('logs a non-success response without the body and still completes the sync', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    fetchMock.mockResolvedValue(new Response(SECRET, { status: 503 }));
    await expect(sync()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { host: 'hc-ping.com', status: 503 },
      'Heartbeat ping failed.',
    );
    expect(logger.debug).not.toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalled();
    expectLogsOmitSecret();
  });

  it('completes the sync when a heartbeat URL cannot be parsed', async () => {
    configuration.HEARTBEAT_URL = 'not a url';
    await expect(sync()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({ host: 'invalid-host' }, 'Heartbeat ping failed.');
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('not a url');
    expect(shutdown).toHaveBeenCalled();
  });

  it('uses POST when HEARTBEAT_METHOD is POST', async () => {
    configuration.HEARTBEAT_URL = SUCCESS_URL;
    configuration.HEARTBEAT_METHOD = 'POST';
    await sync();
    expect(fetchMock).toHaveBeenCalledWith(
      SUCCESS_URL,
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });
});
