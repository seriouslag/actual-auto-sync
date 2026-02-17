import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../logger.js';

// Mock the env module to control LOG_LEVEL
vi.mock('../env.js', () => ({
  env: {
    LOG_LEVEL: 'info',
  },
}));

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should have the correct log level from environment', () => {
    // The logger should use the LOG_LEVEL from env
    expect(logger.level).toBe('info');
  });

  it('should be able to log at different levels', () => {
    // Test that all logging methods exist and are callable
    expect(() => logger.info('test info message')).not.toThrow();
    expect(() => logger.debug('test debug message')).not.toThrow();
    expect(() => logger.warn('test warn message')).not.toThrow();
    expect(() => logger.error('test error message')).not.toThrow();
  });

  it('should handle structured logging with objects', () => {
    const testData = { userId: 123, action: 'login' };
    expect(() => logger.info(testData, 'user action')).not.toThrow();
  });

  it('should handle logging with context', () => {
    expect(() => logger.info({ context: 'test' }, 'message with context')).not.toThrow();
  });

  it('should have proper pino logger structure', () => {
    // Verify it's a proper pino logger instance
    expect(logger).toHaveProperty('child');
    expect(logger).toHaveProperty('level');
    expect(logger).toHaveProperty('silent');
  });
});
