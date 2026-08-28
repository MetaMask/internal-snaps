# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add helpers `serialize`, `deserialize`, and `Serializable` for round-tripping `BigNumber`, `bigint`, `Uint8Array`, and `undefined` through snap state ([#197](https://github.com/MetaMask/internal-snaps/pull/197))
- Add `InFlightCoalescer`, exported from a new `./dedupe` entry point, which coalesces concurrent async operations by key so callers share one in-flight run ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
- Add shared async batching utilities. ([#211](https://github.com/MetaMask/internal-snaps/pull/211))
- Add origin permission helpers ([#193](https://github.com/MetaMask/internal-snaps/pull/193))
  - `createOriginPermissions` for building origin-to-method maps
  - `validateOrigin` for checking an origin against a permission map
- Add a `buildUrl` utility for safely constructing URLs from paths and parameters. ([#195](https://github.com/MetaMask/internal-snaps/pull/195))
- Add `sanitizeControlCharacters` and `sanitizeUri` utilities for validating and sanitizing user-provided strings and URIs. ([#191](https://github.com/MetaMask/internal-snaps/pull/191))
- Add a `safeMerge` utility for shallowly merging objects. ([#166](https://github.com/MetaMask/internal-snaps/pull/166))
- Add a `UrlStruct` utility for validating safe HTTP, HTTPS, and WebSocket URLs. ([#174](https://github.com/MetaMask/internal-snaps/pull/174))

### Changed

- **BREAKING** Replace the logger utilities with a configurable `Logger` class that requires a log level and supports level filtering, per-instance prefixes, and method decorators. ([#136](https://github.com/MetaMask/internal-snaps/pull/136))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))

## [1.0.0]

### Added

- Implement `RemoteFeatureFlagsProvider` (#104](https://github.com/MetaMask/internal-snaps/pull/104), [#102](https://github.com/MetaMask/internal-snaps/pull/102), [#99](https://github.com/MetaMask/internal-snaps/pull/99))
- Implement `AssetsProvider` ([#82](https://github.com/MetaMask/internal-snaps/pull/82))
- Initial package release ([#79](https://github.com/MetaMask/internal-snaps/pull/79))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/snap-networks-utils@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/snap-networks-utils@1.0.0
