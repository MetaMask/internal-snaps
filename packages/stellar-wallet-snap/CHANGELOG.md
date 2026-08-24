# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Use the shared `Logger` from `@metamask/snap-networks-utils` instead of the local logger util ([#182](https://github.com/MetaMask/internal-snaps/pull/182))
  - `LOG_LEVEL` now accepts the shared enum values (`error`, `warn`, `info`, `debug`, `trace`, `silent`); the `all` alias is removed.

## [0.1.0]

### Added

- Initial package release ([#181](https://github.com/MetaMask/internal-snaps/pull/181))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/stellar-wallet-snap@0.1.0
