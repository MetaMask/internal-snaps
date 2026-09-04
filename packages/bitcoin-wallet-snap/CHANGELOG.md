# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `signProofOfOwnershipBatch` for signing multiple proof-of-ownership messages in one request. ([#266](https://github.com/MetaMask/internal-snaps/pull/266))
- Add back the `endowment:assets` permission for the Bitcoin scopes to the snap manifest, with no-op `onAssetsLookup`, `onAssetsConversion`, `onAssetHistoricalPrice`, and `onAssetsMarketData` entry points required to keep the permission ([#274](https://github.com/MetaMask/internal-snaps/pull/274))

### Changed

- **BREAKING** Bump `@metamask/keyring-api` from `^23.7.0` to `^24.1.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/keyring-snap-sdk` from `^9.2.1` to `^10.0.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/snaps-sdk` from `^11.2.0` to `^12.0.1` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- Reduce `keyring_createAccounts` entropy RPCs from one per account to one per distinct parent path by fetching the account-level parent node once and deriving hardened children locally ([#221](https://github.com/MetaMask/internal-snaps/pull/221))
  - The private parent node is held transiently in memory during the batch — the same trust boundary as the previous per-account implementation — and children are neutered before descriptor construction.
  - The creation concurrency throttle is removed: with derivation local, the remaining per-account work is synchronous WASM wallet construction.
- Reduce full-state round trips during batch account creation: the insert step reuses the state snapshot loaded by the existing-accounts lookup instead of re-reading both account maps, and the two state writes now run in parallel ([#221](https://github.com/MetaMask/internal-snaps/pull/221))
- Process the entire requested account range as a single batch instead of chunks of 100, so the existing-accounts lookup and state I/O happen once per request ([#221](https://github.com/MetaMask/internal-snaps/pull/221))
- Split the chain `stopGap` configuration into `{ discovery: 5, scan: 20 }` so account discovery keeps the cheap probe while full account scans use the BIP44 gap limit ([#224](https://github.com/MetaMask/internal-snaps/pull/224))

### Removed

- **BREAKING** Remove the `onAssetsLookup`, `onAssetsConversion`, `onAssetHistoricalPrice`, and `onAssetsMarketData` asset handler entry points, along with the now-unused `AssetsHandler`, `AssetsUseCases`, `InMemoryCache`, `ICache`, and the `endowment:assets` permission ([#260](https://github.com/MetaMask/internal-snaps/pull/260))

### Fixed

- Coalesce concurrent account synchronization runs so stacked triggers (the 30s cronjob, `onActive`, and background events scheduled by `setSelectedAccounts`) share one run instead of duplicating network fetches, state writes, and keyring events ([#221](https://github.com/MetaMask/internal-snaps/pull/221))
- Fix account deletion failing against keyring v2 clients by removing the `AccountDeleted` event emission from the delete flow ([#221](https://github.com/MetaMask/internal-snaps/pull/221))
  - v2 clients reject v1 lifecycle events, which aborted the deletion before the account was removed from state. Deletion is client-initiated in v2, so no event is needed.
- Ensure certain errors are stringified correctly ([#179](https://github.com/MetaMask/internal-snaps/pull/179))

## [2.0.1]

### Fixed

- Fix `onKeyringRequest` responses to correctly return `Json` directly (v2 protocol) instead of v1's `{ pending: false, result }` envelope ([#100](https://github.com/MetaMask/internal-snaps/pull/100))

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))

## [2.0.0] [DEPRECATED]

### Added

- Add support for keyring API v2, including `bip44:derive-path`, `bip44:derive-index`, `bip44:derive-index-range`, and `bip44:discover` account creation types ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Add `exportAccount` method supporting WIF (base58) private key export ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Add `parseDerivationPath` to validate and parse BIP-44 derivation paths for native segwit (BIP-84) accounts ([#43](https://github.com/MetaMask/internal-snaps/pull/43))

### Changed

- **BREAKING** Remove v1 keyring API support (`createAccount`, v1 `Keyring` interface) in favour of v2 ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- **BREAKING:** Re-licensed split into LICENSE.MIT or LICENSE.APACHE2 files (SPDX expression unchanged) ([#75](https://github.com/MetaMask/internal-snaps/pull/75))
- Migrate `KeyringHandler` to implement `KeyringSnapRpc` from `@metamask/keyring-api/v2` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Update `snap.manifest.json` to declare `derivePath` capability in the `bip44` keyring block ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Mark accounts as exportable in the keyring account mapping ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-cli` from `^8.3.0` to `^8.4.1` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/keyring-api` from `^23.2.0` to `^23.7.0` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/keyring-snap-sdk` from `^8.0.0` to `^9.2.1` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/snaps-sdk` from `11.1.1` to `11.2.0` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))

## [1.15.2]

### Fixed

- Fixed RPC endpoints for mainnet and testnet ([#37](https://github.com/MetaMask/internal-snaps/pull/37))
  - Endpoints introduced in version `1.15.1` were causing frequent 429 HTTP errors.

## [1.15.1] [DEPRECATED]

### Changed

- This package was migrated from [snap-bitcoin-wallet](https://github.com/MetaMask/snap-bitcoin-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-bitcoin-wallet/blob/main/packages/snap/CHANGELOG.md).

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@2.0.1...HEAD
[2.0.1]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@2.0.0...@metamask/bitcoin-wallet-snap@2.0.1
[2.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@1.15.2...@metamask/bitcoin-wallet-snap@2.0.0
[1.15.2]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@1.15.1...@metamask/bitcoin-wallet-snap@1.15.2
[1.15.1]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/bitcoin-wallet-snap@1.15.1
