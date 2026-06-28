# Auth — Architecture

This module separates three concerns that are usually tangled in HTTP clients: **what** a credential is (config), **how** it is stored (encrypted, scoped), and **how** it is applied to a request (artifacts). Keeping them apart is what makes every authentication scheme independently testable and the credential reusable.

## Config → artifacts (the applier)

`applyAuth(config, ctx)` is a pure function from an `AuthConfig` (a discriminated union over the supported schemes) to `AuthArtifacts` — a bag of headers, query params, cookies, and optional TLS material. It performs no I/O. Most schemes are trivial header math (Bearer, Basic, API key, cookie, OAuth2 access token); the two non-trivial ones are isolated in their own files:

- `aws-sigv4.ts` implements AWS Signature Version 4 exactly per the spec (canonical request → string-to-sign → derived signing key → signature), so it can be checked against AWS's published `get-vanilla` test vector.
- `digest.ts` parses a `WWW-Authenticate` challenge and computes the digest response (MD5 / MD5-sess, with or without qop).

Because the applier is pure and synchronous, the execution engine (Phase 10) just calls it and merges the artifacts; and OAuth2 token refresh is kept out of it — the token is already current by the time `applyAuth` runs.

## OAuth2 refresh

`token-manager.ts` owns refresh: `isOAuth2Expired` decides when (with clock skew), and `refreshOAuth2` calls an **injected** `TokenFetcher` and returns an updated config. Injecting the fetcher keeps the logic testable now; Phase 10 supplies the real HTTP-backed fetcher.

## Storage and secrecy

Credentials live in `auth_configs`, scoped by `(scope, scopeId)` and named, so one credential is shared by many requests and resolves per environment. The entire serialized config is encrypted at rest via the shared `Encryptor` (OS `safeStorage` in production, `node:crypto` AES-GCM otherwise) — encrypting the whole blob means no individual secret field can leak through the store, and `list` returns only metadata. `safe-storage-encryptor.ts` is the single Electron-dependent file (analogous to `database.ts`); everything else is driver-agnostic and runs under sql.js + `node:crypto` in tests.

## Variable awareness

`AuthService.apply` substitutes `{{variables}}` in every string field of a config before applying, using an evaluator passed in from the variable engine. This is the seam that lets a credential like `{ token: '{{token}}' }` resolve to different values per environment without duplicating the credential.

## Boundary

The module depends only on `PersistenceService`, the `Encryptor` interface, and `node:crypto`. It exposes typed DTOs over IPC (`auth.list/save/delete`); secret material never crosses to the renderer (`list` is metadata-only, `getConfig` is main-process internal). The execution engine and the renderer consume it through those typed surfaces, preserving the dependency direction.
