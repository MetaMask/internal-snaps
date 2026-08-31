# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- feat(solana-wallet-snap): use shareable serialization in Solana snap ([#230](https://github.com/MetaMask/internal-snaps/pull/230))
- refactor(solana-wallet-snap): convert enums to `as const` objects ([#217](https://github.com/MetaMask/internal-snaps/pull/217))
- feat: move batch utils into shared pkg ([#211](https://github.com/MetaMask/internal-snaps/pull/211))
- feat(solana-wallet-snap): use shareable permissions helpers in Solana snap ([#207](https://github.com/MetaMask/internal-snaps/pull/207))
- feat: move buildUrl into shared util pkg ([#195](https://github.com/MetaMask/internal-snaps/pull/195))
- test(solana-wallet-snap): use a non-zero TTL in the fiat cache test ([#194](https://github.com/MetaMask/internal-snaps/pull/194))
- feat: move sanitize utils into shared pkg ([#191](https://github.com/MetaMask/internal-snaps/pull/191))
- chore: move UrlStruct to shared lib ([#174](https://github.com/MetaMask/internal-snaps/pull/174))
- fix: resolve `@metamask/snap-networks-utils` to source for typechecking ([#171](https://github.com/MetaMask/internal-snaps/pull/171))
- chore: add safeMerge shared util ([#166](https://github.com/MetaMask/internal-snaps/pull/166))
- fix: mocklogger types in solana snap ([#164](https://github.com/MetaMask/internal-snaps/pull/164))
- chore: disable eslint rules `jest/no-mocks-import` for test file ([#163](https://github.com/MetaMask/internal-snaps/pull/163))
- chore: replace solana logger with shared util ([#148](https://github.com/MetaMask/internal-snaps/pull/148))

### Changed

- Extract Snap-owned assets domain logic into `SnapAssetsAdapter`; `AssetsService` is a thin facade that delegates metadata, market data, fetch, persist, and account asset reads through the adapter (no Core routing yet). ([#121](https://github.com/MetaMask/internal-snaps/pull/121))
- Align `AssetsService` read API with `snap-networks-utils` / AssetsController shapes by adding `getAccountAssetByID`, `getAccountAssetsByIDs`, `getAccountAssetsByScope`, and `getAccountAssets`, and routing Keyring and Send through them (still Snap-owned storage). ([#120](https://github.com/MetaMask/internal-snaps/pull/120))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))

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
