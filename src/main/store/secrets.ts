import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SecretCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
}

/**
 * Chiffrement réellement utilisable : sous Linux, le backend `basic_text` chiffre avec une clé
 * codée en dur (aucune protection) → on le considère indisponible.
 */
export function isEncryptionUsable(platform: string, available: boolean, backend: string | undefined): boolean {
  if (!available) return false;
  return !(platform === 'linux' && backend === 'basic_text');
}

export function createSecrets(
  filePath: string,
  crypto: SecretCrypto
): { setGithubToken(t: string): void; getGithubToken(): string | null; clearGithubToken(): void } {
  return {
    setGithubToken(t) {
      if (!crypto.isEncryptionAvailable()) throw new Error('ENCRYPTION_UNAVAILABLE');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify({ githubToken: crypto.encryptString(t).toString('base64') }), { mode: 0o600 });
    },
    getGithubToken() {
      try {
        const { githubToken } = JSON.parse(readFileSync(filePath, 'utf8')) as { githubToken?: string };
        return githubToken ? crypto.decryptString(Buffer.from(githubToken, 'base64')) : null;
      } catch {
        return null;
      }
    },
    clearGithubToken() {
      rmSync(filePath, { force: true });
    }
  };
}
