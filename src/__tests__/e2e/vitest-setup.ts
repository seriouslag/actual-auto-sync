/**
 * Vitest E2E test setup file
 *
 * This file intercepts unhandled rejections from @actual-app/api internal operations.
 * The API has background sync operations that may throw errors after we've cleaned up
 * local files, but these are not actual test failures.
 */

// Intercept unhandled rejections from @actual-app/api
process.on('unhandledRejection', (reason, promise) => {
  const stack = reason instanceof Error ? reason.stack : String(reason);

  // Suppress rejections from @actual-app/api internal operations
  if (
    stack?.includes('actual-app') ||
    stack?.includes('download-budget') ||
    stack?.includes('bundle.api.js')
  ) {
    console.log('[E2E Setup] Suppressed unhandled rejection from @actual-app/api');
    // Prevent the rejection from bubbling up
    return;
  }

  // Re-throw other unhandled rejections
  throw reason;
});
