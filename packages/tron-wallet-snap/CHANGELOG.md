# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add back the `endowment:assets` permission for the `tron:728126428` scope to the snap manifest, with no-op `onAssetsLookup`, `onAssetsConversion`, `onAssetHistoricalPrice`, and `onAssetsMarketData` entry points required to keep the permission

### Changed

- **BREAKING** Bump `@metamask/keyring-api` from `^23.7.0` to `^24.1.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/keyring-snap-sdk` from `^9.2.1` to `^10.0.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/snaps-sdk` from `^11.2.0` to `^12.0.1` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))

### Removed

- **BREAKING** Remove the deprecated `asset` cluster of handlers: `onAssetHistoricalPrice`, `onAssetsConversion`, `onAssetsLookup` and `onAssetsMarketData` ([#263](https://github.com/MetaMask/internal-snaps/pull/263))

## [3.2.0]

### Added

- Use Core's `AssetsController` as the source of truth for fungible assets when the Tron assets migration feature flag is enabled ([#145](https://github.com/MetaMask/internal-snaps/pull/145))

### Changed

- Reduce BIP-44 account discovery to a single entropy fetch by reusing the coin-type deriver for the on-chain activity check ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
- Reduce extension RPC round trips in `keyring_createAccounts` from 5 to at most 4 ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
  - `mergeKeyringAccounts` now returns the merge result instead of requiring a post-merge state re-read, and the existing-accounts read runs in parallel with the BIP-32 entropy fetch.
  - `snap_getBip32Entropy` is now called even when all requested indices already exist (this path only occurs on idempotent retries); no new permissions are required.

### Fixed

- Fix account deletion failing against keyring v2 clients by removing the `AccountDeleted` event emission from `keyring_deleteAccount` ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
  - v2 clients reject v1 lifecycle events, which aborted the deletion before the account was removed from state. Deletion is client-initiated in v2, so no event is needed.
- Coalesce concurrent account synchronization runs for the same accounts so stacked triggers (cronjob and background events) share one run instead of duplicating network fetches, state writes, and keyring events ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))
- Estimate native TRX/TRC-10 sends that activate a new account as 1 TRX plus 100 Bandwidth (or 0.1 TRX when staked Bandwidth is insufficient), instead of TransferContract byte size ([#175](https://github.com/MetaMask/internal-snaps/pull/175))
- Fix SUN → USDT swaps routed through Rango and SunSwap displaying a zero SUN amount in transaction activity ([#134](https://github.com/MetaMask/internal-snaps/pull/134))

## [3.1.0]

### Added

- Add Core messenger plumbing (`coreMessenger`, `RemoteFeatureFlagsProvider`, `AssetsProvider`) for upcoming AssetsController migration ([#95](https://github.com/MetaMask/internal-snaps/pull/95))

### Fixed

- Scope `bip44:discover` activity checks and account creation to the networks declared in the snap manifest, preventing unnecessary calls to testnet APIs during discovery ([#135](https://github.com/MetaMask/internal-snaps/pull/135))

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

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@3.2.0...HEAD
[3.2.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@3.1.0...@metamask/tron-wallet-snap@3.2.0
[3.1.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@3.0.0...@metamask/tron-wallet-snap@3.1.0
[3.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@2.0.0...@metamask/tron-wallet-snap@3.0.0
[2.0.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/tron-wallet-snap@2.0.0
