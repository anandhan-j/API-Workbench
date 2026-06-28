# Phase 9 — Authentication Framework

This document records what the Phase 9 milestone delivers, the decisions taken, and its acceptance status. Phase 9 gives requests reusable, securely-stored authentication across many schemes.

## Delivered

An authentication framework under `apps/desktop/src/main/auth`, backed by an encrypted credential store and wired over IPC.

The framework supports Bearer, Basic, API Key (header or query), OAuth2 (with token refresh), HTTP Digest, AWS Signature V4, Cookies, and client certificates. The core is a pure **applier** that turns a (variable-resolved) `AuthConfig` into concrete HTTP artifacts — headers, query params, cookies, and TLS material — that the execution engine (Phase 10) will attach to outgoing requests. AWS SigV4 signing and digest response computation are implemented from `node:crypto`; OAuth2 refresh is handled by a token manager with an injectable token-endpoint fetcher (real HTTP arrives in Phase 10).

Credentials are stored in an `auth_configs` table (migration 0006), scoped (e.g. workspace or collection) and named, with the serialized config **encrypted at rest** through the same `Encryptor` abstraction as the variable engine (Electron `safeStorage` in production, `node:crypto` AES-GCM in tests/fallback). The `AuthService` saves, lists (metadata only — never secrets), decrypts on demand, substitutes variables inside config fields at apply time, refreshes OAuth2 tokens, and applies. IPC channels `auth.list` / `auth.save` / `auth.delete` and a renderer credentials panel manage stored credentials.

## Key decisions

**Applier separate from transport.** Producing auth artifacts is pure and synchronous, decoupled from HTTP. This makes every scheme unit-testable (notably SigV4 against AWS's published vector) and lets the execution engine simply merge the artifacts.

**One encryption abstraction, reused.** Auth reuses the variable engine's `Encryptor`, so secret handling is consistent and testable without Electron. The whole config blob is encrypted, so no secret field can leak through the store.

**Scoped, named, variable-aware credentials.** Storing credentials by scope and name — and resolving `{{variables}}` inside them at apply time — is what makes a single credential reusable across many requests and across environments (the acceptance criterion).

**Token refresh via injected fetcher.** OAuth2 refresh logic is testable now and will plug into the real HTTP client in Phase 10.

## Tests and verification

Thirteen auth tests cover the applier for every scheme, the **AWS SigV4 `get-vanilla` published test vector** (exact signature match), digest challenge parsing and deterministic response, OAuth2 expiry detection and refresh, and the `AuthService` storage path — proving the stored row is encrypted and does not contain the plaintext secret, that listing exposes no secrets, that variable substitution works at apply time, that a credential is reusable across requests, and that OAuth2 refresh persists the new token. With the variable engine's 15 tests this module group is **28 tests passing**, and the auth + persistence source type-checks cleanly (only the `safeStorage` production file requires Electron, exactly like `database.ts`).

The sandbox cannot launch Electron or compile the native driver / `safeStorage`; the live application runs on a developer workstation.

## Acceptance criteria

Phase 9 requires authentication reusable across requests and environments. A stored credential is scoped, named, encrypted, and applied with variable substitution, so the same credential drives many requests and resolves differently per environment via variables. All required schemes — Bearer, OAuth2, Basic, Digest, API Key, Cookies, AWS SigV4, client certificates — plus token refresh and encrypted credential storage are implemented and tested.

## Next

Phase 10 (Request Execution Engine) consumes the variable resolver and auth applier to actually send requests, handling streaming, retries, timeouts, redirects, and cancellation. See the [Roadmap](./ROADMAP.md).
