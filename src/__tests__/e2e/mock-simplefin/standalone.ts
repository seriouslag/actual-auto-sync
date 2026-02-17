/**
 * Standalone entry point for the Mock SimpleFIN Server
 *
 * This file allows the mock server to be run as a standalone process,
 * useful for Docker containers or manual testing.
 */

import { startMockSimpleFinServer, stopMockSimpleFinServer } from './server.js';

const port = Number.parseInt(process.env.MOCK_SIMPLEFIN_PORT || '8080', 10);
const username = process.env.MOCK_SIMPLEFIN_USERNAME || 'test';
const password = process.env.MOCK_SIMPLEFIN_PASSWORD || 'test123';

console.log('Starting Mock SimpleFIN Server...');
console.log(`  Port: ${port}`);
console.log(`  Username: ${username}`);
console.log(`  Password: ${'*'.repeat(password.length)}`);

let runningServer: Awaited<ReturnType<typeof startMockSimpleFinServer>>['server'] | null = null;
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\nShutting down on ${signal}...`);
  try {
    if (runningServer) {
      await stopMockSimpleFinServer(runningServer);
      runningServer = null;
    }
  } catch (error) {
    console.error('Failed to stop mock server cleanly:', error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

startMockSimpleFinServer({ port, username, password })
  .then(({ server, url, accessKey }) => {
    runningServer = server;
    console.log(`\nServer running at ${url}`);
    console.log(`Access key: ${accessKey}`);
    console.log('\nEndpoints:');
    console.log(`  GET ${url}/health - Health check`);
    console.log(`  GET ${url}/accounts?balances-only=1 - List accounts`);
    console.log(`  GET ${url}/accounts?account=X&start-date=Y&pending=1 - Get transactions`);
    console.log('\nPress Ctrl+C to stop the server.');
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
