import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dotenv and pino to avoid side effects
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

vi.mock('pino', () => ({
  pino: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('docker secret', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ACTUAL_SERVER_URL: 'http://localhost:5006',
      CRON_SCHEDULE: '0 0 * * *',
      ACTUAL_BUDGET_SYNC_IDS: 'budget1,budget2',
      ENCRYPTION_PASSWORDS: 'pass1,pass2',
      TIMEZONE: 'Etc/UTC',
      RUN_ON_START: 'false',
    };
    // Clear all mocks
    vi.clearAllMocks();
  });
  const secretPath = '/run/secrets/actual_server_password';
  const envVar = 'ACTUAL_SERVER_PASSWORD';
  const envVarFile = 'ACTUAL_SERVER_PASSWORD_FILE';

  it('secret takes precedence over env', async () => {
    vi.doMock('node:fs/promises', () => ({
      readFile: () => 'secret',
      stat: () => ({ isFile: () => true }),
    }));

    process.env[envVar] = 'env';
    process.env[envVarFile] = secretPath;

    const { env } = await import('../env.js');
    expect(env[envVar]).toEqual('secret');
  });

  it('falls back to env when _FILE is not set', async () => {
    process.env[envVar] = 'env';

    const { env } = await import('../env.js');
    expect(env[envVar]).toEqual('env');
  });

  it('secret is trimmed', async () => {
    vi.doMock('node:fs/promises', () => ({
      readFile: () => '  secret \n  ',
      stat: () => ({ isFile: () => true }),
    }));

    process.env[envVarFile] = secretPath;

    const { env } = await import('../env.js');
    expect(env[envVar]).toEqual('secret');
  });

  it('invalid path', async () => {
    vi.doMock('node:fs/promises', () => ({
      readFile: () => 'secret',
      stat: () => ({ isFile: () => false }),
    }));

    process.env[envVarFile] = secretPath;
    const message = `environment variable ${envVarFile} (${secretPath}) is not a file`;

    await expect(() => import('../env.js')).rejects.toThrow(message);
  });
});
