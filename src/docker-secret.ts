import { readFile, stat } from 'node:fs/promises';

const SECRET_SUFFIX = '_FILE';

export async function getSecret(secretPath: string): Promise<string> {
  const stats = await stat(secretPath);
  if (!stats.isFile()) {
    throw new Error(`secretPath is not a file: ${secretPath}`);
  }
  const secret = await readFile(secretPath, 'utf8');
  return secret.trim();
}

export async function getConfiguration(envName: string): Promise<string | undefined> {
  const secretName = `${envName}${SECRET_SUFFIX}`;
  if (secretName in process.env && process.env[secretName]) {
    return await getSecret(process.env[secretName]);
  }
  if (envName in process.env && process.env[envName]) {
    return process.env[envName];
  }
}
