# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `sanitizeControlCharacters` and `sanitizeUri` utilities for validating and sanitizing user-provided strings and URIs.
- Add origin permission helpers ([#193](https://github.com/MetaMask/internal-snaps/pull/193))
  - `createOriginPermissions` for building origin-to-method maps
  - `validateOrigin` for checking an origin against a permission map
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
