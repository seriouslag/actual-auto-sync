/**
 * Mock SimpleFIN Module
 *
 * Exports all components needed for E2E testing with a mock SimpleFIN server.
 */

// Server exports
export {
  createMockSimpleFinServer,
  startMockSimpleFinServer,
  stopMockSimpleFinServer,
  type MockSimpleFinConfig,
} from './server.js';

// Fixture exports
export {
  // Types
  type MockAccount,
  type MockOrganization,
  type MockTransaction,
  // Data
  accounts,
  organizations,
  transactions,
  // Helper functions
  addTestAccount,
  addTestTransactions,
  createMockAccount,
  createMockTransaction,
  daysAgo,
  getAllAccounts,
  getAccountById,
  getTransactionsForAccount,
  resetFixtures,
} from './fixtures.js';
