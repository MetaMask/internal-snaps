# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]

### Added

- **BREAKING** Implement Keyring API v2 (`KeyringSnapRpc` interface) ([#56](https://github.com/MetaMask/internal-snaps/pull/56), [#101](https://github.com/MetaMask/internal-snaps/pull/101), [#105](https://github.com/MetaMask/internal-snaps/pull/105))

### Fixed

- Disclose the mandatory 9999 TRX `WitnessCreateContract` account-upgrade burn on confirmation ([#73](https://github.com/MetaMask/internal-snaps/pull/73))

## [2.0.0]

### Changed

- **BREAKING:** Re-licensed split into LICENSE.MIT or LICENSE.APACHE2 files (SPDX expression unchanged) ([#75](https://github.com/MetaMask/internal-snaps/pull/75))
- This package was migrated from [snap-tron-wallet](https://github.com/MetaMask/snap-tron-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-tron-wallet/blob/main/packages/snap/CHANGELOG.md)
- Bump `@metamask/keyring-api` from `^23.2.0` to `^23.7.0` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/keyring-snap-sdk` from `^8.0.0` to `^9.2.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-cli` from `^8.3.0` to `^8.4.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-sdk` from `^11.1.1` to `^11.2.0` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/superstruct` from `^3.2.1` to `^3.4.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@2.0.0...@metamask/tron-wallet-snap@3.0.0
[2.0.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/tron-wallet-snap@2.0.0
