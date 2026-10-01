import { aqlQuery, q } from '@actual-app/api';

export interface TransactionSnapshotRow {
  id: string;
  account: string;
  imported_id?: string | null;
  category?: string | null;
  transfer_id?: string | null;
  is_parent?: boolean;
  parent_id?: string | null;
  offbudget?: boolean;
  bankSynced?: boolean;
}

/** Read classification fields, reducing the raw bank data to a presence flag immediately. */
export async function readTransactionSnapshot(): Promise<TransactionSnapshotRow[]> {
  const result = (await aqlQuery(
    q('transactions')
      .select([
        'id',
        'account',
        'imported_id',
        'category',
        'transfer_id',
        'is_parent',
        'parent_id',
        'raw_synced_data',
        { offbudget: 'account.offbudget' },
      ])
      .options({ splits: 'all' }),
  )) as { data: (TransactionSnapshotRow & { raw_synced_data?: string | null })[] };
  if (!Array.isArray(result?.data)) {
    throw new TypeError('Invalid transaction query response.');
  }
  return result.data.map((transaction) => ({
    id: transaction.id,
    account: transaction.account,
    imported_id: transaction.imported_id,
    category: transaction.category,
    transfer_id: transaction.transfer_id,
    is_parent: transaction.is_parent,
    parent_id: transaction.parent_id,
    offbudget: transaction.offbudget,
    bankSynced: Boolean(transaction.raw_synced_data),
  }));
}

function importKeys(transaction: TransactionSnapshotRow): string[] {
  if (!transaction.imported_id && !transaction.bankSynced) {
    return [];
  }
  const keys = [JSON.stringify(['ledger', transaction.account, transaction.id])];
  if (transaction.imported_id) {
    keys.unshift(JSON.stringify(['bank', transaction.account, transaction.imported_id]));
  }
  return keys;
}

/** Stable import IDs survive cache resets; ledger IDs also track pending imports with no bank ID. */
export function countNewUncategorizedTransactions(
  before: TransactionSnapshotRow[],
  after: TransactionSnapshotRow[],
): number {
  const existing = new Set(before.flatMap(importKeys));
  const parents = new Map(
    after
      .filter((transaction) => transaction.is_parent)
      .map((transaction) => [transaction.id, transaction]),
  );
  const added = new Set<string>();
  for (const transaction of after) {
    const parent = parents.get(transaction.parent_id ?? '');
    const source = parent ?? transaction;
    const actionable =
      !transaction.is_parent &&
      !transaction.category &&
      !transaction.offbudget &&
      !transaction.transfer_id &&
      !source.offbudget &&
      !source.transfer_id;
    const keys = importKeys(source);
    if (actionable && keys.length > 0 && !keys.some((key) => existing.has(key))) {
      added.add(keys[0]);
    }
  }
  return added.size;
}
