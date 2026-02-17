/**
 * Vitest E2E test setup file
 *
 * This file intercepts unhandled rejections from @actual-app/api internal operations.
 * The API has background sync operations that may throw errors after we've cleaned up
 * local files, but these are not actual test failures.
 */

function isActualApiRejection(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false;
  }

  // Prefer stable fields first and only use stack as a fallback signal.
  if (reason.name === 'AbortError' && reason.message.includes('download-budget')) {
    return true;
  }

  const stack = reason.stack ?? '';
  return stack.includes('/node_modules/@actual-app/api/') || stack.includes('bundle.api.js');
}

// Intercept unhandled rejections from @actual-app/api
process.on('unhandledRejection', (reason) => {
  if (isActualApiRejection(reason)) {
    console.log('[E2E Setup] Suppressed unhandled rejection from @actual-app/api');
    return;
  }

  // Re-throw other unhandled rejections
  throw reason;
});
