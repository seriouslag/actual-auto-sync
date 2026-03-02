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

const state: SyncStatusRecord = {
  isRunning: false,
  runCount: 0,
};

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
}

export function getSyncStatus(): SyncStatusRecord {
  return { ...state };
}

export type SyncStatusSnapshot = SyncStatusRecord;
