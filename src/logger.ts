import { pino } from 'pino';

export const logger = pino({});

export function isVerbose(logLevel: string): boolean {
  return ['debug', 'info'].includes(logLevel);
}
