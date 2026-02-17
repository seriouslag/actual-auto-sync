/**
 * Mock SimpleFIN Server
 *
 * This server mimics the SimpleFIN API for E2E testing purposes.
 * It supports the same endpoints and response formats that the actual SimpleFIN service uses.
 *
 * Endpoints:
 * - GET /accounts?balances-only=1 → Returns account list for discovery
 * - GET /accounts?account=X&start-date=Y&pending=1 → Returns transactions
 */
import * as http from 'node:http';
import { URL } from 'node:url';

import {
  type MockAccount,
  type MockTransaction,
  getAccountById,
  getAllAccounts,
  getTransactionsForAccount,
} from './fixtures.js';

export interface MockSimpleFinConfig {
  port: number;
  username: string;
  password: string;
}

const DEFAULT_CONFIG: MockSimpleFinConfig = {
  port: 8080,
  username: 'test',
  password: 'test123',
};

/**
 * Validates Basic Auth credentials from the Authorization header
 */
function validateAuth(authHeader: string | undefined, config: MockSimpleFinConfig): boolean {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const base64Credentials = authHeader.slice(6);

  let credentials: string;
  try {
    credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  } catch {
    // Malformed base64 credentials
    return false;
  }

  const separatorIndex = credentials.indexOf(':');
  if (separatorIndex === -1) {
    // Missing "username:password" separator
    return false;
  }

  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);

  return username === config.username && password === config.password;
}

/**
 * Formats a SimpleFIN transaction response
 */
function formatTransactionResponse(transaction: MockTransaction): object {
  return {
    id: transaction.id,
    posted: Math.floor(transaction.posted.getTime() / 1000),
    amount: transaction.amount,
    payee: transaction.payee,
    description: transaction.description,
    pending: transaction.pending,
    transacted_at: transaction.transactedAt
      ? Math.floor(transaction.transactedAt.getTime() / 1000)
      : undefined,
  };
}

/**
 * Formats a SimpleFIN account response
 */
function formatAccountResponse(
  account: MockAccount,
  includeTransactions: boolean,
  startDate?: Date,
): object {
  const baseAccount = {
    id: account.id,
    name: account.name,
    balance: account.balance,
    'balance-date': Math.floor(account.balanceDate.getTime() / 1000),
    currency: account.currency,
    org: {
      id: account.org.id,
      name: account.org.name,
      domain: account.org.domain,
    },
    transactions: [] as object[],
  };

  if (includeTransactions) {
    const transactions = getTransactionsForAccount(account.id, startDate);
    baseAccount.transactions = transactions.map(formatTransactionResponse);
  }

  return baseAccount;
}

/**
 * Handles GET /accounts requests
 */
function handleAccountsRequest(
  url: URL,
  _config: MockSimpleFinConfig,
): { status: number; body: object } {
  const balancesOnly = url.searchParams.get('balances-only') === '1';
  const accountIds = url.searchParams.getAll('account');
  const startDateParam = url.searchParams.get('start-date');
  const includePending = url.searchParams.get('pending') === '1';

  const startDate = startDateParam ? new Date(Number(startDateParam) * 1000) : undefined;

  let accounts: MockAccount[];
  if (accountIds.length > 0) {
    accounts = accountIds
      .map((id) => getAccountById(id))
      .filter((a): a is MockAccount => a !== undefined);
  } else {
    accounts = getAllAccounts();
  }

  const includeTransactions = !balancesOnly && (accountIds.length > 0 || includePending);

  const formattedAccounts = accounts.map((account) =>
    formatAccountResponse(account, includeTransactions, startDate),
  );

  return {
    status: 200,
    body: {
      accounts: formattedAccounts,
      errors: [],
    },
  };
}

/**
 * Creates and starts the mock SimpleFIN server
 */
export function createMockSimpleFinServer(config: Partial<MockSimpleFinConfig> = {}): http.Server {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const server = http.createServer((req, res) => {
    // Parse the URL
    const url = new URL(req.url || '/', `http://localhost:${finalConfig.port}`);

    // Set CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Validate authentication
    if (!validateAuth(req.headers.authorization, finalConfig)) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    // Actual server can request `//accounts` when access keys include a trailing slash.
    // In Docker this can normalize to `/`, so we accept all equivalent account paths.
    const isAccountsPath =
      url.pathname === '/' ||
      url.pathname === '/accounts' ||
      url.pathname === '//accounts' ||
      url.pathname === '/simplefin/accounts' ||
      url.pathname === '/simplefin//accounts';

    // Route requests
    if (req.method === 'GET' && isAccountsPath) {
      const result = handleAccountsRequest(url, finalConfig);
      res.writeHead(result.status);
      res.end(JSON.stringify(result.body));
      return;
    }

    // Unknown endpoint
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

/**
 * Starts the mock server and returns a promise that resolves when it's ready
 */
export function startMockSimpleFinServer(
  config: Partial<MockSimpleFinConfig> = {},
): Promise<{ server: http.Server; url: string; accessKey: string }> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const server = createMockSimpleFinServer(finalConfig);

  return new Promise((resolve, reject) => {
    server.on('error', reject);

    server.listen(finalConfig.port, () => {
      const url = `http://localhost:${finalConfig.port}`;
      const accessKey = `http://${finalConfig.username}:${finalConfig.password}@localhost:${finalConfig.port}/`;

      console.log(`Mock SimpleFIN server started at ${url}`);
      console.log(`Access key: ${accessKey}`);

      resolve({ server, url, accessKey });
    });
  });
}

/**
 * Stops the mock server
 */
export function stopMockSimpleFinServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        console.log('Mock SimpleFIN server stopped');
        resolve();
      }
    });
  });
}
