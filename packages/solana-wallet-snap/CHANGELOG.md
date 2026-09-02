# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Extract Snap-owned assets domain logic into `SnapAssetsAdapter`; `AssetsService` is a thin facade that delegates metadata, market data, fetch, persist, and account asset reads through the adapter (no Core routing yet). ([#121](https://github.com/MetaMask/internal-snaps/pull/121))
- Align `AssetsService` read API with `snap-networks-utils` / AssetsController shapes by adding `getAccountAssetByID`, `getAccountAssetsByIDs`, `getAccountAssetsByScope`, and `getAccountAssets`, and routing Keyring and Send through them (still Snap-owned storage). ([#120](https://github.com/MetaMask/internal-snaps/pull/120))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))
- **BREAKING** Bump `@metamask/keyring-api` from `^23.7.0` to `^24.1.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/keyring-snap-sdk` from `^9.2.1` to `^10.0.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/snaps-sdk` from `^11.2.0` to `^12.0.1` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))

### Fixed

- **BREAKING:** Preserve dapp-origin `signTransaction` and `signAndSendTransaction` payloads by signing the decoded transaction directly ([#156](https://github.com/MetaMask/internal-snaps/pull/156))
- Prevent signing dapp transactions with expired blockhashes, and refresh the blockhash for MetaMask-originated transactions before signing. ([#183](https://github.com/MetaMask/internal-snaps/pull/183))

## [6.0.0]

### Changed

- Bump `@metamask/key-tree` from `9.1.2` to `^10.1.1` ([#133](https://github.com/MetaMask/internal-snaps/pull/133))

### Removed

- **BREAKING:** Removed the legacy snap-hosted send dialog (`startSendTransactionFlow` RPC and `features/send` UI) ([#130](https://github.com/MetaMask/internal-snaps/pull/130))
- **BREAKING:** Removed the deprecated `getFeeForTransaction` RPC ([#130](https://github.com/MetaMask/internal-snaps/pull/130))

## [5.0.1]

### Fixed

- Fixed small USDC-to-SOL swaps being incorrectly displayed as sends in activity ([#108](https://github.com/MetaMask/internal-snaps/pull/108))

## [5.0.0]

### Changed

- **BREAKING:** Re-licensed split into LICENSE.MIT or LICENSE.APACHE2 files (SPDX expression unchanged) ([#72](https://github.com/MetaMask/internal-snaps/pull/72))
- This package was migrated from [snap-solana-wallet](https://github.com/MetaMask/snap-solana-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-solana-wallet/blob/main/packages/snap/CHANGELOG.md). ([#72](https://github.com/MetaMask/internal-snaps/pull/72))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/solana-wallet-snap@6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/solana-wallet-snap@5.0.1...@metamask/solana-wallet-snap@6.0.0
[5.0.1]: https://github.com/MetaMask/internal-snaps/compare/@metamask/solana-wallet-snap@5.0.0...@metamask/solana-wallet-snap@5.0.1
[5.0.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/solana-wallet-snap@5.0.0
