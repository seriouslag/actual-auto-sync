import { DateTime } from 'luxon';

export type SyncResult = 'success' | 'failure';

interface SyncStatusRecord {
  isRunning: boolean;
  runCount: number;
  lastSyncStart?: string;
  lastSyncEnd?: string;
  lastSyncResult?: SyncResult;
  lastSyncError?: string;
}

export interface SyncHistoryEntry {
  start?: string;
  end?: string;
  duration?: string;
  result?: SyncResult;
  error?: string;
}

const MAX_HISTORY_ENTRIES = 20;
const state: SyncStatusRecord = {
  isRunning: false,
  runCount: 0,
};
const runHistory: SyncHistoryEntry[] = [];

export function computeDuration(start?: string, end?: string): string | undefined {
  if (!start || !end) {
    return undefined;
  }
  const startDate = DateTime.fromISO(start);
  const endDate = DateTime.fromISO(end);
  if (!startDate.isValid || !endDate.isValid) {
    return undefined;
  }
  const duration = endDate.diff(startDate, ['hours', 'minutes', 'seconds']);
  return duration.toHuman({ style: 'short', maximumFractionDigits: 0 });
}

function recordHistoryEntry(): void {
  const entry: SyncHistoryEntry = {
    start: state.lastSyncStart,
    end: state.lastSyncEnd,
    result: state.lastSyncResult,
    error: state.lastSyncError,
    duration: computeDuration(state.lastSyncStart, state.lastSyncEnd),
  };
  runHistory.unshift(entry);
  if (runHistory.length > MAX_HISTORY_ENTRIES) {
    runHistory.pop();
  }
}

export function markSyncStart(): void {
  state.runCount += 1;
  state.isRunning = true;
  state.lastSyncStart = DateTime.now().toISO();
  state.lastSyncError = undefined;
}

export function markSyncComplete(success: boolean, error?: Error): void {
  state.isRunning = false;
  state.lastSyncEnd = DateTime.now().toISO();
  state.lastSyncResult = success ? 'success' : 'failure';
  state.lastSyncError = error?.message;
  recordHistoryEntry();
}

export function getSyncStatus(): SyncStatusSnapshot {
  return {
    ...state,
    history: [...runHistory],
  };
}

export function resetSyncStatus(): void {
  state.isRunning = false;
  state.runCount = 0;
  state.lastSyncStart = undefined;
  state.lastSyncEnd = undefined;
  state.lastSyncResult = undefined;
  state.lastSyncError = undefined;
  runHistory.length = 0;
}

export type SyncStatusSnapshot = SyncStatusRecord & {
  history: SyncHistoryEntry[];
};
