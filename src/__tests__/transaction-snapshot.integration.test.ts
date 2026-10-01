import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as api from '@actual-app/api';
import { expect, it } from 'vitest';

import {
  countNewUncategorizedTransactions,
  readTransactionSnapshot,
} from '../transaction-snapshot.js';

it('queries real Actual budgets and classifies imports without a server', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'actual-notification-test-'));
  try {
    const handle = await api.init({ dataDir: directory, verbose: false });
    await api.runImport('Notification query test', async () => {
      const checking = await api.createAccount({ name: 'Checking' });
      const tracking = await api.createAccount({ name: 'Tracking', offbudget: true });
      const [category] = await api.getCategories();
      await api.addTransactions(checking, [
        { date: '2026-09-01', amount: -100, imported_id: 'backlog' },
      ]);
      const before = await readTransactionSnapshot();
      await api.addTransactions(checking, [
        { date: '2026-09-02', amount: -100, imported_id: 'new' },
        { date: '2026-09-03', amount: -100, imported_id: 'categorized', category: category.id },
        { date: '2026-09-04', amount: -100 },
        { date: '2026-09-05', amount: -100, imported_id: 'deleted' },
      ]);
      const beforePending = new Set(
        (await readTransactionSnapshot()).map((transaction) => transaction.id),
      );
      await api.addTransactions(checking, [{ date: '2026-09-06', amount: -200 }]);
      const pendingId = (await readTransactionSnapshot()).find(
        (transaction) => !beforePending.has(transaction.id),
      )!.id;
      await handle.db.update('transactions', {
        id: pendingId,
        raw_synced_data: '{"booked":false}',
      });
      await api.addTransactions(checking, [
        {
          date: '2026-09-07',
          amount: -300,
          imported_id: 'split',
          subtransactions: [{ amount: -100, category: category.id }, { amount: -200 }],
        },
      ]);
      await api.addTransactions(tracking, [
        { date: '2026-09-02', amount: -100, imported_id: 'tracking' },
      ]);
      const withDeleted = await readTransactionSnapshot();
      const deleted = withDeleted.find((transaction) => transaction.imported_id === 'deleted')!;
      await api.deleteTransaction(deleted.id);
      await expect
        .poll(async () => {
          const snapshot = await readTransactionSnapshot();
          return snapshot.some((transaction) => transaction.imported_id === 'deleted');
        })
        .toBe(false);
      const after = await readTransactionSnapshot();
      expect(after.find((transaction) => transaction.imported_id === 'tracking')).toMatchObject({
        offbudget: true,
      });
      expect(after.some((transaction) => transaction.imported_id === 'deleted')).toBe(false);
      expect(after.find((transaction) => transaction.id === pendingId)).toMatchObject({
        bankSynced: true,
      });
      expect(after.find((transaction) => transaction.id === pendingId)).not.toHaveProperty(
        'raw_synced_data',
      );
      expect(countNewUncategorizedTransactions(before, after)).toBe(3);
      expect(countNewUncategorizedTransactions(after, await readTransactionSnapshot())).toBe(0);
    });
  } finally {
    await api.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
