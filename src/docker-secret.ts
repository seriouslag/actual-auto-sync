import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const SECRET_SUFFIX = '_FILE';

type Secrets = Record<string, string>;

// return on secret
export async function getSecret(secretPath: string): Promise<string> {
  const stats = await stat(secretPath);
  if (!stats.isFile()) {
    throw new Error(`secretPath is not a file: ${secretPath}`);
  }
  const secret = await readFile(secretPath, 'utf8');
  return secret.trim();
}

// return all secrets
export async function getSecrets(secretDir: string): Promise<Secrets> {
  const secrets: Secrets = {};
  const stats = await stat(secretDir);
  if (!stats.isDirectory()) {
    throw new Error(`secret directory don't exists: ${secretDir}`);
  }
  for (const file of await readdir(secretDir)) {
    secrets[file] = await getSecret(join(secretDir, file));
  }

  return secrets;
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
