# ADR-0007: Plugin SDK as a versioned, capability-constrained contract

- **Status:** Accepted (isolation mechanism refined by ADR-0010; request-type model defined by ADR-0009)
- **Date:** 2026-06-27
- **Related:** ADR-0001, ADR-0003, ADR-0005, ADR-0009, ADR-0010

## Context

API Workbench must be extensible by third parties — custom workflow nodes, custom request types, custom authentication providers, and custom importers — without forking the core (Phase 16, marketplace-ready). Plugins are untrusted code. The core therefore needs an extension surface that is stable enough to build a marketplace against, yet constrained enough that a plugin cannot bypass the security boundary (ADR-0003) or reach into the file system, database, network, or secrets without mediation.

## Decision

We will expose a **versioned Plugin SDK** that defines a small, explicit extension API: registration points for node types (extending the workflow domain model of ADR-0005), request types, auth providers, and importers. Plugins declare the capabilities they require and receive only mediated, contract-based access to host services — the same validated channels the core uses (ADR-0003), never raw Node, raw SQLite, or raw network handles. The SDK surface is treated as a public, semantically versioned contract: additive changes bump the minor version, breaking changes bump the major version and are documented in the SDK guide. The plugin loader validates a plugin's manifest and SDK-version compatibility before activation and isolates plugin execution from privileged internals.

## Alternatives considered

**Letting plugins import core packages directly** was rejected because it would couple plugins to internal structure, break encapsulation (ADR-0001), and make the core impossible to evolve without breaking the ecosystem. **Granting plugins unmediated Node/file/network access** was rejected as a direct violation of the security model (ADR-0003). **An unversioned, ad-hoc extension surface** was rejected because a marketplace needs stable compatibility guarantees; without versioning, every core change risks silently breaking installed plugins. **Out-of-process plugin sandboxing for every plugin** was considered for stronger isolation; it remains an option for higher-risk capabilities but is not mandated for all plugins in the initial design to keep the common case simple.

## Consequences

Third parties can extend the four designated points against a stable, documented contract, and the core can evolve behind that contract using semantic versioning. Plugins operate with constrained, mediated capabilities, preserving the security boundary and the clean-architecture encapsulation. The cost is the ongoing obligation to treat the SDK surface as a public API — careful version management, deprecation discipline, and compatibility testing — and to design each new extension point as a contract rather than an internal hook. This decision generalises the extension points opened by earlier phases (notably the workflow model in ADR-0005).
