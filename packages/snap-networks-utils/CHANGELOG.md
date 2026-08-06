# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING** Replace the logger utilities with a configurable `Logger` class that defaults to trace logging and supports level filtering, per-instance prefixes, and method decorators. `log` is retained as a deprecated alias for `info`.

## [1.0.0]

### Added

- Implement `RemoteFeatureFlagsProvider` (#104](https://github.com/MetaMask/internal-snaps/pull/104), [#102](https://github.com/MetaMask/internal-snaps/pull/102), [#99](https://github.com/MetaMask/internal-snaps/pull/99))
- Implement `AssetsProvider` ([#82](https://github.com/MetaMask/internal-snaps/pull/82))
- Initial package release ([#79](https://github.com/MetaMask/internal-snaps/pull/79))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/snap-networks-utils@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/snap-networks-utils@1.0.0
