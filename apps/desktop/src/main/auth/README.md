# Auth Module

The Authentication Framework (Phase 9). Stores reusable, encrypted credentials and turns them into concrete HTTP artifacts the execution engine applies.

See [Architecture.md](./Architecture.md) and [Phase 9](../../../../../docs/PHASE_9.md).

## Public API

- `AuthService` (construct with `PersistenceService` + `Encryptor`): `save`, `list` (metadata only), `getConfig` (decrypted, internal), `delete`, `applyConfig`, `apply(id, ctx, evaluate?)`, `refresh(id, fetcher)`, `needsRefresh(id)`.
- `applyAuth(config, ctx)` — pure: config → `AuthArtifacts` ({ headers, query, cookies, tls }).
- `signSigV4(input)` — AWS Signature V4 headers.
- `parseChallenge` / `buildDigestHeader` — HTTP Digest.
- `refreshOAuth2(config, fetcher)` / `isOAuth2Expired(config)` — OAuth2 token refresh.

## Supported schemes

Bearer, Basic, API Key (header/query), OAuth2 (+ refresh), Digest (MD5 / MD5-sess), AWS SigV4, Cookies, and client certificates (returned as TLS material).

## Usage

```ts
const auth = new AuthService(persistence, new SafeStorageEncryptor());

const cred = auth.save({ scope: 'workspace', scopeId, name: 'Prod', config: { type: 'bearer', token: '{{token}}' } });

// at request time, with a variable evaluator from the variable engine:
const artifacts = auth.apply(cred.id, { method: 'GET', url }, (tpl) => variables.evaluate(tpl, ctx));
// → artifacts.headers / query / cookies / tls, applied by the execution engine
```

Secret material is encrypted at rest; `list` never returns secrets. OAuth2 access tokens are refreshed via an injected token-endpoint fetcher.
