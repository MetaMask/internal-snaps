# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING** Replace the logger utilities with a configurable `Logger` class that requires a log level and supports level filtering, per-instance prefixes, and method decorators.

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))
- Set `baseUrl` in this package's `tsconfig.json` and restate the workspace `@metamask/*` path mapping relative to it, so the package keeps `baseUrl`-relative import ergonomics without losing correct workspace-source resolution ([#169](https://github.com/MetaMask/internal-snaps/pull/169))

### Fixed

- Assign optional `Logger` `prefix` and `decorators` only when they are provided so `exactOptionalPropertyTypes` consumers can typecheck against workspace source ([#167](https://github.com/MetaMask/internal-snaps/pull/167))

## [1.0.0]

### Added

- Implement `RemoteFeatureFlagsProvider` (#104](https://github.com/MetaMask/internal-snaps/pull/104), [#102](https://github.com/MetaMask/internal-snaps/pull/102), [#99](https://github.com/MetaMask/internal-snaps/pull/99))
- Implement `AssetsProvider` ([#82](https://github.com/MetaMask/internal-snaps/pull/82))
- Initial package release ([#79](https://github.com/MetaMask/internal-snaps/pull/79))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/snap-networks-utils@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/snap-networks-utils@1.0.0
