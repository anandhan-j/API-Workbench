# ADR-0006: Secret and credential storage via OS-backed encryption

- **Status:** Accepted
- **Date:** 2026-06-27
- **Related:** ADR-0003, ADR-0004

## Context

API Workbench stores sensitive material: secret variables, OAuth tokens, API keys, Basic/Digest credentials, AWS keys, and client certificates. These must persist locally (ADR-0004) yet never be exposed in plaintext to the renderer, to logs, or on disk in a recoverable form. The variable engine (Phase 8) defines secret and encrypted variable types, and the authentication framework (Phase 9) needs to store and refresh credentials. The threat model includes a compromised renderer (ADR-0003) and another user or process reading the app's data files.

## Decision

We will encrypt secrets at rest using Electron `safeStorage`, which derives a key from the OS credential store (Keychain on macOS, DPAPI on Windows, libsecret/kwallet on Linux). Secrets are stored only as ciphertext in SQLite. Decryption happens exclusively in the main process and only for the duration of the operation that needs the value — typically resolving a variable or applying authentication just before dispatching a request. Plaintext secret values are never sent to the renderer, never written to logs (the structured logger redacts known secret fields), and never included in version snapshots or exports except as opt-in, re-encrypted payloads. Where the OS backend is unavailable, the app surfaces the reduced guarantee to the user rather than silently downgrading to plaintext.

## Alternatives considered

**Storing secrets in plaintext in SQLite** was rejected as an unacceptable exposure given the local-file and compromised-renderer threats. **App-managed encryption with a key bundled in the app** was rejected because a shipped key provides no real protection. **A user-supplied master password** was considered; it adds friction and a recovery burden, and `safeStorage` already binds protection to the OS user account, so it was not adopted as the default (it may be offered later as an additional layer via a future ADR). **Sending decrypted secrets to the renderer for convenience** was rejected as a direct violation of the boundary in ADR-0003.

## Consequences

Secrets are bound to the OS user account, never leave the main process in plaintext, and are kept out of logs, snapshots, and the renderer, satisfying the secure-secret-handling acceptance criteria. The cost is platform-specific behaviour and a graceful-degradation path when the OS backend is absent, plus the discipline of redaction in logging and explicit, re-encrypted handling in export/version flows. This decision depends on the persistence model (ADR-0004) and is enforced by the process boundary (ADR-0003).
