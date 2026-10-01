import { describe, expect, it } from 'vitest';

import { countNewUncategorizedTransactions } from '../transaction-snapshot.js';

const tx = (id: string, fields = {}) => ({
  id,
  account: 'checking',
  imported_id: `bank-${id}`,
  category: null,
  ...fields,
});

describe('new uncategorized transaction detection', () => {
  it('excludes backlog, categorized, off-budget, transfer, and manual transactions', () => {
    const before = [tx('old')];
    const after = [
      ...before,
      tx('new'),
      tx('categorized', { category: 'food' }),
      tx('offbudget', { offbudget: true }),
      tx('transfer', { transfer_id: 'other' }),
      tx('manual', { imported_id: null }),
    ];
    expect(countNewUncategorizedTransactions(before, after)).toBe(1);
  });

  it('recognizes existing bank transactions whose ledger IDs change during a retry', () => {
    expect(
      countNewUncategorizedTransactions(
        [tx('old')],
        [tx('replacement', { imported_id: 'bank-old' })],
      ),
    ).toBe(0);
  });

  it('recognizes a matched manual transaction as a new import', () => {
    expect(
      countNewUncategorizedTransactions([tx('manual', { imported_id: null })], [tx('manual')]),
    ).toBe(1);
  });

  it('scopes bank IDs to accounts', () => {
    expect(
      countNewUncategorizedTransactions(
        [tx('old')],
        [tx('new', { account: 'savings', imported_id: 'bank-old' })],
      ),
    ).toBe(1);
  });

  it('counts an imported split once if any child needs a category', () => {
    const parent = tx('split', { is_parent: true });
    const children = [
      tx('child1', { parent_id: 'split', imported_id: null }),
      tx('child2', { parent_id: 'split', imported_id: null }),
    ];
    expect(countNewUncategorizedTransactions([], [parent, ...children])).toBe(1);
    expect(
      countNewUncategorizedTransactions(
        [],
        [parent, ...children.map((child) => ({ ...child, category: 'food' }))],
      ),
    ).toBe(0);
    expect(countNewUncategorizedTransactions([parent, ...children], [parent, ...children])).toBe(0);
  });
});

it('counts ID-less pending bank transactions but not manual entries', () => {
  const pending = tx('pending', { imported_id: null, bankSynced: true });
  expect(
    countNewUncategorizedTransactions([], [pending, tx('manual', { imported_id: null })]),
  ).toBe(1);
  expect(countNewUncategorizedTransactions([pending], [pending])).toBe(0);
});
it('does not alert again when an existing pending bank transaction receives its bank ID', () => {
  const pending = tx('pending', { imported_id: null, bankSynced: true });
  expect(
    countNewUncategorizedTransactions([pending], [{ ...pending, imported_id: 'booked' }]),
  ).toBe(0);
});
