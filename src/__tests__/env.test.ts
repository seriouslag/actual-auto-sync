import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  actualDataDirSchema,
  budgetIdSchema,
  cronScheduleSchema,
  encryptionPasswordSchema,
  logLevelSchema,
  runOnStartSchema,
  serverPasswordSchema,
  serverUrlSchema,
  timezoneSchema,
} from '../env.js';

// Mock dotenv and pino to avoid side effects
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

vi.mock('pino', () => ({
  pino: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@t3-oss/env-core', () => ({
  createEnv: vi.fn(),
}));

describe('Environment Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('budgetIdSchema', () => {
    it('should transform comma-separated string to array', () => {
      const result = budgetIdSchema.parse('budget1,budget2,budget3');
      expect(result).toEqual(['budget1', 'budget2', 'budget3']);
    });

    it('should handle single value without commas', () => {
      const result = budgetIdSchema.parse('single-budget');
      expect(result).toEqual(['single-budget']);
    });

    it('should handle empty string', () => {
      const result = budgetIdSchema.parse('');
      expect(result).toEqual(['']);
    });

    it('should handle string with only commas', () => {
      const result = budgetIdSchema.parse(',,,');
      expect(result).toEqual(['', '', '', '']);
    });

    it('should handle whitespace around commas', () => {
      const result = budgetIdSchema.parse(' budget1 , budget2 , budget3 ');
      expect(result).toEqual([' budget1 ', ' budget2 ', ' budget3 ']);
    });

    it('should handle special characters', () => {
      // Note: The comma in the string will be split, so we need to escape it or use a different approach
      const specialBudgetId = 'budget-with-special-chars!@#$%^&*()_+-=[]{}|;\':",./<>?';
      const result = budgetIdSchema.parse(specialBudgetId);
      // The comma in the string will split it into multiple parts
      expect(result).toEqual(['budget-with-special-chars!@#$%^&*()_+-=[]{}|;\':"', './<>?']);
    });

    it('should handle very long strings', () => {
      const longBudgetId = 'a'.repeat(1000);
      const result = budgetIdSchema.parse(longBudgetId);
      expect(result).toEqual([longBudgetId]);
    });
  });

  describe('encryptionPasswordSchema', () => {
    it('should transform comma-separated string to array with default empty array', () => {
      const result = encryptionPasswordSchema.parse('pass1,pass2,pass3');
      expect(result).toEqual(['pass1', 'pass2', 'pass3']);
    });

    it('should return empty array when no value provided', () => {
      const result = encryptionPasswordSchema.parse(undefined);
      expect(result).toEqual([]);
    });

    it('should handle empty string input', () => {
      const result = encryptionPasswordSchema.parse('');
      expect(result).toEqual(['']);
    });

    it('should handle single password without commas', () => {
      const result = encryptionPasswordSchema.parse('single-password');
      expect(result).toEqual(['single-password']);
    });

    it('should handle whitespace around commas', () => {
      const result = encryptionPasswordSchema.parse(' pass1 , pass2 , pass3 ');
      expect(result).toEqual([' pass1 ', ' pass2 ', ' pass3 ']);
    });
  });

  describe('Environment Variable Validation Schemas', () => {
    describe('ACTUAL_SERVER_URL', () => {
      it('should accept valid URLs', () => {
        expect(() => serverUrlSchema.parse('https://example.com')).not.toThrow();
        expect(() => serverUrlSchema.parse('http://localhost:3000')).not.toThrow();
        expect(() => serverUrlSchema.parse('https://api.example.com/v1')).not.toThrow();
        expect(() =>
          serverUrlSchema.parse('https://example.com/api?key=value&token=123'),
        ).not.toThrow();
      });

      it('should reject empty strings', () => {
        expect(() => serverUrlSchema.parse('')).toThrow();
      });

      it('should reject undefined values', () => {
        expect(() => serverUrlSchema.parse(undefined)).toThrow();
      });
    });

    describe('ACTUAL_SERVER_PASSWORD', () => {
      it('should accept non-empty strings', () => {
        expect(() => serverPasswordSchema.parse('secret123')).not.toThrow();
        expect(() => serverPasswordSchema.parse('password')).not.toThrow();
        expect(() => serverPasswordSchema.parse('a')).not.toThrow();
      });

      it('should reject empty strings', () => {
        expect(() => serverPasswordSchema.parse('')).toThrow();
      });
    });

    describe('CRON_SCHEDULE', () => {
      it('should accept valid cron expressions', () => {
        expect(() => cronScheduleSchema.parse('0 1 * * *')).not.toThrow();
        expect(() => cronScheduleSchema.parse('*/5 * * * *')).not.toThrow();
        expect(() => cronScheduleSchema.parse('0 0 1 1 *')).not.toThrow();
        expect(() => cronScheduleSchema.parse('0 12 * * 1-5')).not.toThrow();
      });

      it('should reject strings that are too short', () => {
        expect(() => cronScheduleSchema.parse('0 1 *')).toThrow();
        expect(() => cronScheduleSchema.parse('0 1')).toThrow();
        expect(() => cronScheduleSchema.parse('0')).toThrow();
        expect(() => cronScheduleSchema.parse('')).toThrow();
      });
    });

    describe('LOG_LEVEL', () => {
      it('should accept valid log levels', () => {
        expect(() => logLevelSchema.parse('info')).not.toThrow();
        expect(() => logLevelSchema.parse('debug')).not.toThrow();
        expect(() => logLevelSchema.parse('warn')).not.toThrow();
        expect(() => logLevelSchema.parse('error')).not.toThrow();
      });

      it('should reject invalid log levels', () => {
        expect(() => logLevelSchema.parse('invalid')).toThrow();
        expect(() => logLevelSchema.parse('INFO')).toThrow();
        expect(() => logLevelSchema.parse('Info')).toThrow();
        expect(() => logLevelSchema.parse('')).toThrow();
      });
    });

    describe('TIMEZONE', () => {
      it('should accept timezone strings', () => {
        expect(() => timezoneSchema.parse('Etc/UTC')).not.toThrow();
        expect(() => timezoneSchema.parse('America/New_York')).not.toThrow();
        expect(() => timezoneSchema.parse('Europe/London')).not.toThrow();
        expect(() => timezoneSchema.parse('Asia/Tokyo')).not.toThrow();
      });

      it('should use default value when not provided', () => {
        const result = timezoneSchema.parse(undefined);
        expect(result).toBe('Etc/UTC');
      });
    });

    describe('ACTUAL_DATA_DIR', () => {
      it('should accept directory strings when provided', () => {
        expect(() => actualDataDirSchema.parse('/data')).not.toThrow();
        expect(() => actualDataDirSchema.parse('./legacy-data')).not.toThrow();
      });

      it('should remain optional for backward compatibility', () => {
        const result = actualDataDirSchema.parse(undefined);
        expect(result).toBeUndefined();
      });
    });

    describe('RUN_ON_START', () => {
      it('should coerce various string representations to boolean', () => {
        // Test various boolean string representations
        // In JavaScript, any non-empty string is truthy when coerced to boolean
        const testCases = [
          { input: true, expected: true },
          { input: false, expected: false },
          { input: 'true', expected: true },
          { input: 'false', expected: false }, // "false" is a non-empty string, so it's truthy
          { input: '1', expected: true },
          { input: '0', expected: false }, // "0" is a non-empty string, so it's truthy
          { input: 'yes', expected: true },
          { input: 'no', expected: false }, // "no" is a non-empty string, so it's truthy
          { input: 'on', expected: true },
          { input: 'off', expected: false }, // "off" is a non-empty string, so it's truthy
          { input: '', expected: false }, // Only empty string is falsy
          { input: 'TRUE', expected: true },
          { input: 'FALSE', expected: false },
          { input: 'YES', expected: true },
          { input: 'NO', expected: false },
          { input: 'ON', expected: true },
          { input: 'OFF', expected: false },
          { input: 'DNJSND', expected: false },
        ];

        for (const { input, expected } of testCases) {
          const result = runOnStartSchema.parse(input);
          expect(result).toBe(expected);
        }
      });

      it('should use default value when not provided', () => {
        const result = runOnStartSchema.parse(undefined);
        expect(result).toBe(false);
      });
    });
  });

  describe('Schema Transformations', () => {
    it('should handle budget ID transformations correctly', () => {
      // Test various input formats
      const testCases = [
        { input: 'budget1', expected: ['budget1'] },
        { input: 'budget1,budget2', expected: ['budget1', 'budget2'] },
        {
          input: 'budget1,budget2,budget3',
          expected: ['budget1', 'budget2', 'budget3'],
        },
        { input: '', expected: [''] },
        { input: 'budget1,', expected: ['budget1', ''] },
        { input: ',budget1', expected: ['', 'budget1'] },
      ];

      for (const { input, expected } of testCases) {
        const result = budgetIdSchema.parse(input);
        expect(result).toEqual(expected);
      }
    });

    it('should handle encryption password transformations correctly', () => {
      // Test various input formats
      const testCases = [
        { input: 'pass1', expected: ['pass1'] },
        { input: 'pass1,pass2', expected: ['pass1', 'pass2'] },
        { input: '', expected: [''] },
        { input: undefined, expected: [] },
      ];

      for (const { input, expected } of testCases) {
        const result = encryptionPasswordSchema.parse(input);
        expect(result).toEqual(expected);
      }
    });
  });

  describe('Module initialization', () => {
    it('should log fallback message when dotenv config throws', async () => {
      vi.resetModules();

      const info = vi.fn();
      const warn = vi.fn();
      const createEnv = vi.fn(() => ({}));
      const thrownError = new Error('No .env file');

      vi.doMock('dotenv', () => ({
        config: vi.fn(() => {
          throw thrownError;
        }),
      }));
      vi.doMock('pino', () => ({
        pino: vi.fn(() => ({
          info,
          warn,
        })),
      }));
      vi.doMock('@t3-oss/env-core', () => ({
        createEnv,
      }));

      await import('../env.js');

      expect(warn).toHaveBeenCalledWith(
        { err: thrownError },
        'Unable to load .env file. Using system environment variables.',
      );
      expect(createEnv).toHaveBeenCalledTimes(1);
    });
  });
});
