import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

export const READ_ONLY_REQUIRED_MESSAGE =
  'Container root filesystem is writable. Run with --read-only (or read_only: true in docker-compose) and mount /data as writable tmpfs/volume.';

const CONTAINER_CGROUP_MARKERS = ['docker', 'kubepods', 'containerd', 'podman', 'crio', 'lxc'];

interface ContainerRootFilesystemState {
  isContainer: boolean;
  isReadOnly: boolean;
}

function parseRootMountLine(mountInfo: string): string | undefined {
  return mountInfo
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
}

export function isRootFilesystemReadOnly(mountInfo: string): boolean {
  const rootMountLine = parseRootMountLine(mountInfo);
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

export function shouldEnforceReadOnlyRootFilesystem(
  enforceReadOnlyValue: string | undefined = process.env.ENFORCE_READ_ONLY,
): boolean {
  if (!enforceReadOnlyValue) {
    return false;
  }
  switch (enforceReadOnlyValue.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on': {
      return true;
    }
    default: {
      return false;
    }
  }
}

function containsContainerCgroupMarker(cgroupInfo: string): boolean {
  const loweredCgroupInfo = cgroupInfo.toLowerCase();
  return CONTAINER_CGROUP_MARKERS.some((marker) => loweredCgroupInfo.includes(marker));
}

async function cgroupIndicatesContainer(): Promise<boolean> {
  const cgroupPaths = ['/proc/1/cgroup', '/proc/self/cgroup'];
  for (const cgroupPath of cgroupPaths) {
    try {
      const cgroupInfo = await readFile(cgroupPath, 'utf8');
      if (containsContainerCgroupMarker(cgroupInfo)) {
        return true;
      }
    } catch {
      // Ignore missing or unreadable cgroup files.
    }
  }
  return false;
}

export function shouldAssumeRunningInContainer(
  runningInContainerValue: string | undefined = process.env.RUNNING_IN_CONTAINER,
): boolean {
  if (!runningInContainerValue) {
    return false;
  }
  switch (runningInContainerValue.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on': {
      return true;
    }
    default: {
      return false;
    }
  }
}

export async function isRunningInContainer() {
  if (shouldAssumeRunningInContainer()) {
    return true;
  }

  if (existsSync('/.dockerenv')) {
    return true;
  }

  return cgroupIndicatesContainer();
}

export async function isContainerRootFilesystemReadOnly() {
  if (!(await isRunningInContainer())) {
    return {
      isContainer: false,
      isReadOnly: true,
    } satisfies ContainerRootFilesystemState;
  }

  const mountInfo = await readFile('/proc/self/mountinfo', 'utf8');
  return {
    isContainer: true,
    isReadOnly: isRootFilesystemReadOnly(mountInfo),
  } satisfies ContainerRootFilesystemState;
}

export async function enforceReadOnlyRootFilesystem() {
  const { isContainer, isReadOnly } = await isContainerRootFilesystemReadOnly();
  if (isContainer && !isReadOnly) {
    throw new Error(READ_ONLY_REQUIRED_MESSAGE);
  }
}
