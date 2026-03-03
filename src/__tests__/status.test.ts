import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSyncStatus,
  markSyncComplete,
  markSyncStart,
  resetSyncStatus,
} from '../status.js';

describe('sync status history', () => {
  beforeEach(() => {
    resetSyncStatus();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records a history entry after a run completes', () => {
    markSyncStart();
    vi.advanceTimersByTime(5_000);
    markSyncComplete(true);

    const status = getSyncStatus();
    expect(status.history).toHaveLength(1);
    expect(status.history[0]).toMatchObject({ result: 'success' });
    expect(status.history[0].duration).toBeDefined();
  });

  it('limits history length to 20 entries', () => {
    for (let i = 0; i < 30; i++) {
      markSyncStart();
      markSyncComplete(i % 2 === 0);
    }

    const status = getSyncStatus();
    expect(status.history.length).toBeLessThanOrEqual(20);
  });
});
