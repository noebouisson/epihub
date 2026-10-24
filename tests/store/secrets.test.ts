import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createSecrets, isEncryptionUsable } from '../../src/main/store/secrets';

const reverse = (s: string): string => [...s].reverse().join('');
const fakeCrypto = (available: boolean) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s: string) => Buffer.from(reverse(s)),
  decryptString: (b: Buffer) => reverse(b.toString())
});

let p: string;
let sec: ReturnType<typeof createSecrets>;
let noCrypto: ReturnType<typeof createSecrets>;
beforeEach(() => {
  p = join(mkdtempSync(join(tmpdir(), 'epihub-secrets-')), 'secrets.json');
  sec = createSecrets(p, fakeCrypto(true));
  noCrypto = createSecrets(p, fakeCrypto(false));
});

test('stocke puis relit le token', () => { sec.setGithubToken('ghp_x'); expect(sec.getGithubToken()).toBe('ghp_x'); });
test('le fichier ne contient pas le token en clair', () => { sec.setGithubToken('ghp_x'); expect(readFileSync(p, 'utf8')).not.toContain('ghp_x'); });
test('refuse si le chiffrement est indisponible', () => { expect(() => noCrypto.setGithubToken('t')).toThrow('ENCRYPTION_UNAVAILABLE'); });
test('clear supprime le token', () => { sec.setGithubToken('t'); sec.clearGithubToken(); expect(sec.getGithubToken()).toBeNull(); });

test('basic_text sous Linux = chiffrement indisponible', () => {
  expect(isEncryptionUsable('linux', true, 'basic_text')).toBe(false);
  expect(isEncryptionUsable('linux', true, 'gnome_libsecret')).toBe(true);
  expect(isEncryptionUsable('linux', false, 'gnome_libsecret')).toBe(false);
  expect(isEncryptionUsable('darwin', true, undefined)).toBe(true);
});
test('createSecrets refuse quand le backend est basic_text', () => {
  const s = createSecrets(p, { ...fakeCrypto(true), isEncryptionAvailable: () => isEncryptionUsable('linux', true, 'basic_text') });
  expect(() => s.setGithubToken('t')).toThrow('ENCRYPTION_UNAVAILABLE');
});
