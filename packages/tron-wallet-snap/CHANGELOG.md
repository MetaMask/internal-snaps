# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Route fungible asset reads (TRX, TRC10, TRC20) through `AssetsController:getAsset`. Protocol assets (energy, bandwidth, staking, lock/withdrawal, rewards) remain Snap-owned.

### Changed

- Batch fungible asset reads through `AssetsController:getAssets` instead of per-asset `getAsset` loops. Account sync now fetches and persists only snap-owned protocol assets; fungibles are owned by Core `AssetsController`.
- Bump `@metamask/keyring-api` from `^23.2.0` to `^23.7.0` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/keyring-snap-sdk` from `^8.0.0` to `^9.2.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-cli` from `^8.3.0` to `^8.4.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-sdk` from `^11.1.1` to `^11.2.0` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/superstruct` from `^3.2.1` to `^3.4.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))

## [1.33.2]

### Changed

- This package was migrated from [snap-tron-wallet](https://github.com/MetaMask/snap-tron-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-tron-wallet/blob/main/packages/snap/CHANGELOG.md). ([#45](https://github.com/MetaMask/internal-snaps/pull/45))
- Changed the package license from dual MIT-0/Apache-2.0 licensing to a single MIT license. ([#50](https://github.com/MetaMask/internal-snaps/pull/50))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@1.33.2...HEAD
[1.33.2]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/tron-wallet-snap@1.33.2
