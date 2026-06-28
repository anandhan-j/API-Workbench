import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import type { Encryptor } from './encryptor';

/**
 * A self-contained, reversible `Encryptor` built on `node:crypto` AES-256-GCM.
 *
 * Used as the test/fallback implementation so secret handling can be verified
 * without the Electron runtime, and so secrets still get a meaningful at-rest
 * transformation on platforms where Electron's `safeStorage` is unavailable.
 *
 * The key is derived (scrypt) from a passphrase. In production the OS-backed
 * `SafeStorageEncryptor` is preferred; this fixed-key variant is a fallback and
 * is not equivalent to OS keychain protection.
 */
export class NodeEncryptor implements Encryptor {
  private readonly key: Buffer;

  constructor(passphrase = 'api-workbench-variable-engine') {
    // Deterministic salt keeps the derived key stable across process restarts so
    // previously-stored ciphertext remains decryptable.
    this.key = scryptSync(passphrase, 'awb-variable-salt', 32);
  }

  isAvailable(): boolean {
    return true;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Layout: iv | authTag | ciphertext, all base64.
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(cipher: string): string {
    const raw = Buffer.from(cipher, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
}
