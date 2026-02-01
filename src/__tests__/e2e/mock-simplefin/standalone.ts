/**
 * Standalone entry point for the Mock SimpleFIN Server
 *
 * This file allows the mock server to be run as a standalone process,
 * useful for Docker containers or manual testing.
 */

import { startMockSimpleFinServer } from './server.js';

const port = Number.parseInt(process.env.MOCK_SIMPLEFIN_PORT || '8080', 10);
const username = process.env.MOCK_SIMPLEFIN_USERNAME || 'test';
const password = process.env.MOCK_SIMPLEFIN_PASSWORD || 'test123';

console.log('Starting Mock SimpleFIN Server...');
console.log(`  Port: ${port}`);
console.log(`  Username: ${username}`);
console.log(`  Password: ${'*'.repeat(password.length)}`);

startMockSimpleFinServer({ port, username, password })
  .then(({ url, accessKey }) => {
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
  console.log('\nShutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  process.exit(0);
});
