import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { E2E_CONFIG } from './setup.js';

function isRootMountReadOnly(mountInfo: string): boolean {
  const rootMountLine = mountInfo
    .split('\n')
    .map((line) => line.trim())
    .find((line) => {
      if (!line || !line.includes(' - ')) {
        return false;
      }
      const [leftSide] = line.split(' - ', 2);
      const fields = leftSide.split(' ');
      return fields[4] === '/';
    });

  if (!rootMountLine) {
    throw new Error('Unable to locate root mount entry in /proc/self/mountinfo');
  }

  const [leftSide, rightSide] = rootMountLine.split(' - ', 2);
  const mountFields = leftSide.split(' ');
  const fsFields = rightSide.split(' ');
  const mountOptions = new Set((mountFields[5] ?? '').split(','));
  const superOptions = new Set((fsFields[2] ?? '').split(','));
  return mountOptions.has('ro') || superOptions.has('ro');
}

describe('E2E: Container User Configuration', () => {
  it('runs as the expected uid/gid when configured', () => {
    const expectedUid = process.env.E2E_EXPECT_UID;
    const expectedGid = process.env.E2E_EXPECT_GID;

    if (typeof process.getuid !== 'function' || typeof process.getgid !== 'function') {
      return;
    }

    if (expectedUid) {
      expect(process.getuid()).toBe(Number(expectedUid));
    }
    if (expectedGid) {
      expect(process.getgid()).toBe(Number(expectedGid));
    }
  });

  it('can write to the configured e2e data directory', async () => {
    const probePath = join(E2E_CONFIG.dataDir, `uid-gid-probe-${Date.now()}.txt`);

    await mkdir(E2E_CONFIG.dataDir, { recursive: true });
    await writeFile(probePath, 'ok', 'utf8');
    const content = await readFile(probePath, 'utf8');
    expect(content).toBe('ok');

    await rm(probePath, { force: true });
  });

  it('runs with a read-only root filesystem', async () => {
    const mountInfo = await readFile('/proc/self/mountinfo', 'utf8');
    expect(isRootMountReadOnly(mountInfo)).toBe(true);
  });

  it('can write to /tmp when root filesystem is read-only', async () => {
    const probePath = join('/tmp', `tmp-probe-${Date.now()}.txt`);
    await writeFile(probePath, 'ok', 'utf8');
    const content = await readFile(probePath, 'utf8');
    expect(content).toBe('ok');
    await rm(probePath, { force: true });
  });
});
