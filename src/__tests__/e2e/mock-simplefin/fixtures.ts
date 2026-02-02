/**
 * Mock SimpleFIN Test Fixtures
 *
 * Provides test data for the mock SimpleFIN server including:
 * - Multiple bank accounts with different institutions
 * - Transaction sets per account
 * - Configurable error scenarios
 */

export interface MockOrganization {
  id: string;
  name: string;
  domain: string;
}

export interface MockAccount {
  id: string;
  name: string;
  balance: string;
  balanceDate: Date;
  currency: string;
  org: MockOrganization;
}

export interface MockTransaction {
  id: string;
  posted: Date;
  amount: string;
  payee: string;
  description: string;
  pending: boolean;
  transactedAt?: Date;
}

// Organizations (Banks)
export const organizations: Record<string, MockOrganization> = {
  'bank-001': {
    id: 'bank-001',
    name: 'Test Bank',
    domain: 'testbank.com',
  },
  'bank-002': {
    id: 'bank-002',
    name: 'Second Bank',
    domain: 'secondbank.com',
  },
  'credit-001': {
    id: 'credit-001',
    name: 'Test Credit Union',
    domain: 'testcreditunion.org',
  },
};

// Calculate dates relative to "now" for realistic test data
const now = new Date();
const daysAgo = (days: number): Date => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0); // Normalize to noon
  return date;
};

// Accounts
export const accounts: Record<string, MockAccount> = {
  'ACT-001': {
    id: 'ACT-001',
    name: 'Test Checking',
    balance: '1234.56',
    balanceDate: daysAgo(0),
    currency: 'USD',
    org: organizations['bank-001'],
  },
  'ACT-002': {
    id: 'ACT-002',
    name: 'Test Savings',
    balance: '5000.00',
    balanceDate: daysAgo(0),
    currency: 'USD',
    org: organizations['bank-001'],
  },
  'ACT-003': {
    id: 'ACT-003',
    name: 'Second Bank Checking',
    balance: '2500.75',
    balanceDate: daysAgo(0),
    currency: 'USD',
    org: organizations['bank-002'],
  },
  'ACT-004': {
    id: 'ACT-004',
    name: 'Credit Union Account',
    balance: '750.00',
    balanceDate: daysAgo(1),
    currency: 'USD',
    org: organizations['credit-001'],
  },
};

// Store original transaction data for reset functionality
const originalTransactionData: Record<string, MockTransaction[]> = {};

// Transactions per account
export const transactions: Record<string, MockTransaction[]> = {
  'ACT-001': [
    {
      id: 'TXN-001-001',
      posted: daysAgo(1),
      amount: '-25.50',
      payee: 'Coffee Shop',
      description: 'Morning coffee',
      pending: false,
    },
    {
      id: 'TXN-001-002',
      posted: daysAgo(2),
      amount: '-150.00',
      payee: 'Grocery Store',
      description: 'Weekly groceries',
      pending: false,
    },
    {
      id: 'TXN-001-003',
      posted: daysAgo(3),
      amount: '2500.00',
      payee: 'Employer Inc',
      description: 'Payroll deposit',
      pending: false,
    },
    {
      id: 'TXN-001-004',
      posted: daysAgo(5),
      amount: '-89.99',
      payee: 'Internet Provider',
      description: 'Monthly internet bill',
      pending: false,
    },
    {
      id: 'TXN-001-005',
      posted: daysAgo(7),
      amount: '-42.30',
      payee: 'Gas Station',
      description: 'Fuel',
      pending: false,
    },
    // Pending transaction
    {
      id: 'TXN-001-006',
      posted: daysAgo(0),
      amount: '-15.00',
      payee: 'Restaurant',
      description: 'Lunch',
      pending: true,
      transactedAt: daysAgo(0),
    },
  ],
  'ACT-002': [
    {
      id: 'TXN-002-001',
      posted: daysAgo(1),
      amount: '100.00',
      payee: 'Transfer',
      description: 'Transfer from checking',
      pending: false,
    },
    {
      id: 'TXN-002-002',
      posted: daysAgo(15),
      amount: '500.00',
      payee: 'Transfer',
      description: 'Monthly savings',
      pending: false,
    },
    {
      id: 'TXN-002-003',
      posted: daysAgo(30),
      amount: '0.12',
      payee: 'Interest',
      description: 'Monthly interest',
      pending: false,
    },
  ],
  'ACT-003': [
    {
      id: 'TXN-003-001',
      posted: daysAgo(2),
      amount: '-200.00',
      payee: 'Electric Company',
      description: 'Utility bill',
      pending: false,
    },
    {
      id: 'TXN-003-002',
      posted: daysAgo(4),
      amount: '-1200.00',
      payee: 'Landlord',
      description: 'Rent payment',
      pending: false,
    },
    {
      id: 'TXN-003-003',
      posted: daysAgo(10),
      amount: '3000.00',
      payee: 'Employer Inc',
      description: 'Payroll deposit',
      pending: false,
    },
  ],
  'ACT-004': [
    {
      id: 'TXN-004-001',
      posted: daysAgo(1),
      amount: '-50.00',
      payee: 'ATM Withdrawal',
      description: 'Cash withdrawal',
      pending: false,
    },
    {
      id: 'TXN-004-002',
      posted: daysAgo(5),
      amount: '200.00',
      payee: 'Deposit',
      description: 'Cash deposit',
      pending: false,
    },
  ],
};

/**
 * Get all accounts
 */
export function getAllAccounts(): MockAccount[] {
  return Object.values(accounts);
}

/**
 * Get account by ID
 */
export function getAccountById(id: string): MockAccount | undefined {
  return accounts[id];
}

/**
 * Get transactions for an account, optionally filtered by start date
 */
export function getTransactionsForAccount(accountId: string, startDate?: Date): MockTransaction[] {
  const accountTransactions = transactions[accountId] || [];

  if (!startDate) {
    return accountTransactions;
  }

  return accountTransactions.filter((txn) => txn.posted >= startDate);
}

/**
 * Add a new account dynamically (useful for tests)
 */
export function addTestAccount(account: MockAccount): void {
  accounts[account.id] = account;
}

/**
 * Add transactions to an account dynamically (useful for tests)
 */
export function addTestTransactions(accountId: string, newTransactions: MockTransaction[]): void {
  if (!transactions[accountId]) {
    transactions[accountId] = [];
  }
  transactions[accountId].push(...newTransactions);
}

// Base account IDs that should be preserved/reset
const BASE_ACCOUNT_IDS = ['ACT-001', 'ACT-002', 'ACT-003', 'ACT-004'];

// Initialize original transaction data (deep copy)
function initializeOriginalData(): void {
  if (Object.keys(originalTransactionData).length === 0) {
    BASE_ACCOUNT_IDS.forEach((id) => {
      if (transactions[id]) {
        originalTransactionData[id] = JSON.parse(JSON.stringify(transactions[id]));
      }
    });
  }
}

// Call initialization immediately
initializeOriginalData();

/**
 * Reset all fixtures to default state.
 * This removes dynamically added accounts/transactions and restores
 * the original transaction arrays for base accounts.
 */
export function resetFixtures(): void {
  // Reset accounts - remove dynamically added ones
  Object.keys(accounts).forEach((key) => {
    if (!BASE_ACCOUNT_IDS.includes(key)) {
      delete accounts[key];
    }
  });

  // Reset transactions - remove dynamically added accounts
  Object.keys(transactions).forEach((key) => {
    if (!BASE_ACCOUNT_IDS.includes(key)) {
      delete transactions[key];
    }
  });

  // Restore original transaction arrays for base accounts
  // This handles the case where tests pushed items to existing arrays
  BASE_ACCOUNT_IDS.forEach((id) => {
    if (originalTransactionData[id]) {
      transactions[id] = JSON.parse(JSON.stringify(originalTransactionData[id]));
    }
  });
}

/**
 * Create a new transaction with realistic data
 */
export function createMockTransaction(
  overrides: Partial<MockTransaction> & { id: string },
): MockTransaction {
  return {
    posted: daysAgo(1),
    amount: '-10.00',
    payee: 'Test Payee',
    description: 'Test transaction',
    pending: false,
    ...overrides,
  };
}

/**
 * Create a new account with realistic data
 */
export function createMockAccount(overrides: Partial<MockAccount> & { id: string }): MockAccount {
  return {
    name: 'Test Account',
    balance: '1000.00',
    balanceDate: daysAgo(0),
    currency: 'USD',
    org: organizations['bank-001'],
    ...overrides,
  };
}

// Export helper for date calculation
export { daysAgo };
