# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore(solana): ratchet coverage thresholds with jest-it-up ([#351](https://github.com/MetaMask/internal-snaps/pull/351))
- feat(tron): use shared baseconfig ([#311](https://github.com/MetaMask/internal-snaps/pull/311))
- feat(solana-wallet-snap): use shared analytics lib ([#335](https://github.com/MetaMask/internal-snaps/pull/335))
- chore(solana): extend the shared jest config ([#340](https://github.com/MetaMask/internal-snaps/pull/340))
- test(solana): cover transaction approved/rejected scheduling ([#332](https://github.com/MetaMask/internal-snaps/pull/332))
- Release/11.0.0 ([#325](https://github.com/MetaMask/internal-snaps/pull/325))
- feat(solana): use shared baseconfig ([#310](https://github.com/MetaMask/internal-snaps/pull/310))
- fix(solana): tolerate unknown fields in external API responses ([#321](https://github.com/MetaMask/internal-snaps/pull/321))
- feat(solana-wallet-snap): use shared keyring account ([#317](https://github.com/MetaMask/internal-snaps/pull/317))
- Release/10.0.0 ([#305](https://github.com/MetaMask/internal-snaps/pull/305))
- chore(solana): use shared cache utils ([#292](https://github.com/MetaMask/internal-snaps/pull/292))
- feat(solana-wallet-snap): use shareable state management lib ([#294](https://github.com/MetaMask/internal-snaps/pull/294))
- chore: drop Node 20 and target ES2023 ([#283](https://github.com/MetaMask/internal-snaps/pull/283))
- chore: snap build tooling cleanup (babel config, preinstalled builds, manifest locales) ([#264](https://github.com/MetaMask/internal-snaps/pull/264))
- chore: reorganize `tsconfig` files for clarity ([#257](https://github.com/MetaMask/internal-snaps/pull/257))
- chore: enable Snap TypeScript checking ([#237](https://github.com/MetaMask/internal-snaps/pull/237))
- feat: add shared trackError util ([#246](https://github.com/MetaMask/internal-snaps/pull/246))
- feat(solana-wallet-snap): use shareable UuidStruct ([#249](https://github.com/MetaMask/internal-snaps/pull/249))
- feat: move errors helpers into shared pkg ([#241](https://github.com/MetaMask/internal-snaps/pull/241))
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

### Added

- Add `signProofOfOwnershipBatch` for signing multiple proof-of-ownership messages in one request. ([#256](https://github.com/MetaMask/internal-snaps/pull/256))
- Add back the `endowment:assets` permission for the Solana scopes to the snap manifest, with no-op `onAssetsLookup`, `onAssetsConversion`, `onAssetHistoricalPrice`, and `onAssetsMarketData` entry points required to keep the permission ([#274](https://github.com/MetaMask/internal-snaps/pull/274))

### Changed

- Reduce `snap_getBip32Entropy` calls in `createAccounts` from two to one for `bip44:discover` by deriving the activity-check address locally from the already-fetched coin-type node, and parallelize the entropy fetch with the existing-accounts state read for all creation paths ([#304](https://github.com/MetaMask/internal-snaps/pull/304))
- Coalesce concurrent `AccountsSynchronizer.synchronize` calls for the same account set so duplicate in-flight syncs (e.g. simultaneous connection-recovery events across mainnet and devnet) share one run instead of fanning out redundant asset and transaction fetches ([#304](https://github.com/MetaMask/internal-snaps/pull/304))
- **BREAKING:** Bump `@solana/kit` from `^6.9.0` to `^8.3.0` and the `@solana-program/*` clients (`compute-budget` `^0.18.1`, `system` `^0.14.1`, `token` `^0.16.1`, `token-2022` `^0.17.0`) to their Kit 8-compatible versions. ([#303](https://github.com/MetaMask/internal-snaps/pull/303))
- **BREAKING:** Update the Solana Name Service integration to SNS SDK v1 and the Kit 6.9-compatible Solana program clients ([#271](https://github.com/MetaMask/internal-snaps/pull/271))
- Migrate `trackError` and `withCatchAndThrowSnapError` to `@metamask/snap-networks-utils` `createSnapErrorHandling`, and add `getSnapProvider` for Snap RPC access
- Extract Snap-owned assets domain logic into `SnapAssetsAdapter`; `AssetsService` is a thin facade that delegates metadata, market data, fetch, persist, and account asset reads through the adapter (no Core routing yet). ([#121](https://github.com/MetaMask/internal-snaps/pull/121))
- Align `AssetsService` read API with `snap-networks-utils` / AssetsController shapes by adding `getAccountAssetByID`, `getAccountAssetsByIDs`, `getAccountAssetsByScope`, and `getAccountAssets`, and routing Keyring and Send through them (still Snap-owned storage). ([#120](https://github.com/MetaMask/internal-snaps/pull/120))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))
- **BREAKING** Bump `@metamask/keyring-api` from `^23.7.0` to `^24.1.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/keyring-snap-sdk` from `^9.2.1` to `^10.0.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/snaps-sdk` from `^11.2.0` to `^12.0.1` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))

### Removed

- **BREAKING** Remove the `onAssetsLookup`, `onAssetsConversion`, `onAssetHistoricalPrice`, and `onAssetsMarketData` asset handler entry points, along with the now-unused handler modules and the `endowment:assets` permission ([#261](https://github.com/MetaMask/internal-snaps/pull/261))
- **BREAKING** Remove `AssetsService.fetchAssetsMarketData` and `SnapAssetsAdapter.fetchAssetsMarketData`, the `TokenPricesService` class, and `PriceApiClient.getHistoricalPrices`, all of which were only used by the removed asset handlers ([#261](https://github.com/MetaMask/internal-snaps/pull/261))
- Remove the now-unused `PriceApiClient.getFiatExchangeRates` method and related `ExchangeRate` type, the unused `tokenPrices` unencrypted state field, the unused `fiatExchangeRates` and `historicalPrices` price API cache TTL options, and unused price API test mocks ([#261](https://github.com/MetaMask/internal-snaps/pull/261))

### Fixed

- **BREAKING:** Preserve dapp-origin `signTransaction` and `signAndSendTransaction` payloads by signing the decoded transaction directly ([#156](https://github.com/MetaMask/internal-snaps/pull/156))
- Prevent signing dapp transactions with expired blockhashes, and refresh the blockhash for MetaMask-originated transactions before signing. ([#183](https://github.com/MetaMask/internal-snaps/pull/183))
- Tolerate unknown fields in the Price API spot price and Token API metadata responses so that new fields
  added by the API no longer fail validation ([#321](https://github.com/MetaMask/internal-snaps/pull/321))

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
