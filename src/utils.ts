import { mkdir, readdir, stat } from "node:fs/promises";

import cronstrue from "cronstrue";

import { logger } from "./logger.js";

export function formatCronSchedule(schedule: string) {
  return (
    cronstrue.toString(schedule).charAt(0).toLowerCase() +
    cronstrue.toString(schedule).slice(1)
  );
}

export async function isDirectory(path: string) {
  try {
    const dir = await stat(path);
    return dir.isDirectory();
  } catch (err) {
    return false;
  }
}

export async function createDirectory(path: string) {
  const dirExists = await isDirectory(path);
  if (!dirExists) {
    logger.info(`Creating directory ${path}`);
    await mkdir(path, { recursive: true });
    logger.info("Directory created successfully.");
  } else {
    logger.info(`Using existing directory ${path}.`);
  }
}

export async function listSubDirectories(directory: string) {
  const subDirectories = await readdir(directory, { withFileTypes: true });
  return subDirectories
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}
