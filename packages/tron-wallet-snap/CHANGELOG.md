# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `CoreAssetsAdapter` and `mapControllerAsset` for AssetsController integration (wired unused until routing lands) ([#144](https://github.com/MetaMask/internal-snaps/pull/144))

### Changed

- Reduce BIP-44 account discovery to a single entropy fetch by reusing the coin-type deriver for the on-chain activity check ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
- Reduce extension RPC round trips in `keyring_createAccounts` from 5 to at most 4 ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
  - `mergeKeyringAccounts` now returns the merge result instead of requiring a post-merge state re-read, and the existing-accounts read runs in parallel with the BIP-32 entropy fetch.
  - `snap_getBip32Entropy` is now called even when all requested indices already exist (this path only occurs on idempotent retries); no new permissions are required.
- Extract shared asset util functions and inject `SnapAssetsAdapter` from `context` into `AssetsService` ([#143](https://github.com/MetaMask/internal-snaps/pull/143))
- Rename `getByKeyringAccountId` to `getAccountAssets` (with essential-asset synthesis) and update keyring callers ([#143](https://github.com/MetaMask/internal-snaps/pull/143))

### Fixed

- Fix account deletion failing against keyring v2 clients by removing the `AccountDeleted` event emission from `keyring_deleteAccount` ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
  - v2 clients reject v1 lifecycle events, which aborted the deletion before the account was removed from state. Deletion is client-initiated in v2, so no event is needed.
- Coalesce concurrent account synchronization runs for the same accounts so stacked triggers (cronjob and background events) share one run instead of duplicating network fetches, state writes, and keyring events ([#149](https://github.com/MetaMask/internal-snaps/pull/149))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))

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

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@3.1.0...HEAD
[3.1.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@3.0.0...@metamask/tron-wallet-snap@3.1.0
[3.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@2.0.0...@metamask/tron-wallet-snap@3.0.0
[2.0.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/tron-wallet-snap@2.0.0
