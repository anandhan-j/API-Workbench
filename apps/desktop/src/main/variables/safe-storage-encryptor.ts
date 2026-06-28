import { safeStorage } from 'electron';
import type { Encryptor } from './encryptor';

/**
 * Production `Encryptor` backed by Electron's `safeStorage`, which uses the OS
 * keychain/credential store (Keychain on macOS, libsecret/DPAPI elsewhere).
 *
 * This file imports `electron` and therefore must NEVER be imported by tests or
 * by any driver-agnostic module — only the composition root (`main/index.ts`)
 * constructs it. Tests use `NodeEncryptor` instead.
 */
export class SafeStorageEncryptor implements Encryptor {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  encrypt(plain: string): string {
    return safeStorage.encryptString(plain).toString('base64');
  }

  decrypt(cipher: string): string {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  }
}
