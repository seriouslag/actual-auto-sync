import { readFile, stat } from 'node:fs/promises';

const SECRET_SUFFIX = '_FILE';

export async function getSecret(secretPath: string): Promise<string | undefined> {
  const stats = await stat(secretPath);
  if (stats.isFile()) {
    const secret = await readFile(secretPath, 'utf8');
    return secret.trim();
  }
}

export async function getConfiguration(envName: string): Promise<string | undefined> {
  const secretName = `${envName}${SECRET_SUFFIX}`;
  if (secretName in process.env && process.env[secretName]) {
    const path = process.env[secretName];
    const secret = await getSecret(path);
    if (typeof secret === 'string') {
      return secret;
    }
    throw new Error(`environment variable ${secretName} (${path}) is not a file`);
  }
  if (envName in process.env && process.env[envName]) {
    return process.env[envName];
  }
}
