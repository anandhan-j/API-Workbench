/**
 * The Plugin SDK contract version (semver). The desktop app validates a
 * plugin's `engines.sdk` range against its own SDK version before activation:
 * additive SDK changes bump the minor version, breaking changes bump the major
 * version (ADR-0007).
 */
export const SDK_VERSION = '1.0.0';
