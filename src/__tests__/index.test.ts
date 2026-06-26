import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cron.js', () => ({
  createCronJob: vi.fn(),
}));

vi.mock('../error-handlers.js', () => ({
  registerUncaughtExceptionHandler: vi.fn(),
  registerUnhandledRejectionHandler: vi.fn(),
}));

describe('index.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers error handlers, creates and starts the cron job', async () => {
    const { createCronJob } = await import('../cron.js');
    const { registerUncaughtExceptionHandler, registerUnhandledRejectionHandler } =
      await import('../error-handlers.js');

    const mockStart = vi.fn();
    vi.mocked(createCronJob).mockReturnValue({ start: mockStart } as any);

    await import('../index.js');

    expect(registerUncaughtExceptionHandler).toHaveBeenCalledOnce();
    expect(registerUnhandledRejectionHandler).toHaveBeenCalledOnce();
    expect(createCronJob).toHaveBeenCalledOnce();
    expect(mockStart).toHaveBeenCalledOnce();
  });
});
