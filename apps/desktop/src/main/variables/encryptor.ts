/**
 * Abstraction over the platform secret-encryption primitive.
 *
 * The production implementation (`safe-storage-encryptor.ts`) wraps Electron's
 * `safeStorage`, which uses the OS keychain. Tests inject a `NodeEncryptor`
 * (pure `node:crypto`) so they never need the Electron runtime. The
 * `VariableService` depends only on this interface.
 */
export interface Encryptor {
  /** Whether encryption is available; if false, secrets are stored as plaintext. */
  isAvailable(): boolean;
  /** Encrypts a plaintext string, returning an opaque (base64) ciphertext. */
  encrypt(plain: string): string;
  /** Reverses `encrypt`. */
  decrypt(cipher: string): string;
}
