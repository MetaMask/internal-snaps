# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Uncategorized

- feat(stellar-wallet-snap): use shareable state management lib ([#297](https://github.com/MetaMask/internal-snaps/pull/297))
- fix(stellar-wallet-snap): price-api request missing market data ([#299](https://github.com/MetaMask/internal-snaps/pull/299))
- chore(stellar-wallet-snap): remove dead code `getAssetsMetadataByAssetIds` ([#286](https://github.com/MetaMask/internal-snaps/pull/286))
- chore: drop Node 20 and target ES2023 ([#283](https://github.com/MetaMask/internal-snaps/pull/283))
- ci: add SonarCloud analysis for the monorepo ([#272](https://github.com/MetaMask/internal-snaps/pull/272))
- chore: snap build tooling cleanup (babel config, preinstalled builds, manifest locales) ([#264](https://github.com/MetaMask/internal-snaps/pull/264))
- chore: reorganize `tsconfig` files for clarity ([#257](https://github.com/MetaMask/internal-snaps/pull/257))
- feat: use shared trackError in stellar ([#250](https://github.com/MetaMask/internal-snaps/pull/250))
- chore: enable Snap TypeScript checking ([#237](https://github.com/MetaMask/internal-snaps/pull/237))
- feat(stellar-wallet-snap): use shareable UuidStruct ([#251](https://github.com/MetaMask/internal-snaps/pull/251))
- feat: move errors helpers into shared pkg ([#241](https://github.com/MetaMask/internal-snaps/pull/241))
- Release/9.0.0 ([#240](https://github.com/MetaMask/internal-snaps/pull/240))
- feat(stellar-wallet-snap): use shareable serialization in Stellar snap ([#235](https://github.com/MetaMask/internal-snaps/pull/235))
- refactor(stellar-wallet-snap): convert enums to `as const` objects ([#227](https://github.com/MetaMask/internal-snaps/pull/227))
- feat: move batch utils into shared pkg ([#211](https://github.com/MetaMask/internal-snaps/pull/211))
- feat(stellar-wallet-snap): use shareable permissions helpers in Stellar snap ([#212](https://github.com/MetaMask/internal-snaps/pull/212))
- feat: move buildUrl into shared util pkg ([#195](https://github.com/MetaMask/internal-snaps/pull/195))
- feat: move sanitize utils into shared pkg ([#191](https://github.com/MetaMask/internal-snaps/pull/191))
- feat(stellar-wallet-snap): use shared safeMerge in Stellar snap ([#192](https://github.com/MetaMask/internal-snaps/pull/192))
- feat(stellar-wallet-snap): use shared urlstruct ([#190](https://github.com/MetaMask/internal-snaps/pull/190))

### Added

- Add `signProofOfOwnership` client request for silent proof-of-ownership signing (SEP-0053) ([#186](https://github.com/MetaMask/internal-snaps/pull/186))
- Add `exportAccount` keyring method for base32 Stellar secret-seed export ([#187](https://github.com/MetaMask/internal-snaps/pull/187))
- Add `TrustlineExceedLimitException` for send simulation when a payment would exceed the destination trustline limit (previously a generic `TransactionValidationException`) ([#185](https://github.com/MetaMask/internal-snaps/pull/185))
- Add `@metamask/snap-networks-utils` `^1.0.0` ([#182](https://github.com/MetaMask/internal-snaps/pull/182))
  - Use the shared `Logger`

### Changed

- Display transaction error message in ChangeTrustOpt and ConfirmSend confirmation dialogs ([#220](https://github.com/MetaMask/internal-snaps/pull/220))
- Skip destination validation in `onAmountInput` ([#220](https://github.com/MetaMask/internal-snaps/pull/220))
- `createValidatedSendTransaction` now throws `InvalidAssetForCreateAccountException` instead of `AccountNotActivatedException` when sending a non-native asset to an unfunded destination ([#185](https://github.com/MetaMask/internal-snaps/pull/185))
- **BREAKING** Bump `@metamask/keyring-api` from `^23.7.0` to `^24.1.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/keyring-snap-sdk` from `^9.2.1` to `^10.0.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/snaps-sdk` from `^11.2.0` to `^12.0.1` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))

### Removed

- **BREAKING** Remove the deprecated `asset` cluster of handlers: `onAssetHistoricalPrice`, `onAssetsConversion`, `onAssetsLookup` and `onAssetsMarketData` ([#262](https://github.com/MetaMask/internal-snaps/pull/262))

### Fixed

- Skip unrecognized activity that is not from this wallet's inner source account, such as fee-bumps and claim-balance transactions for other accounts ([#298](https://github.com/MetaMask/internal-snaps/pull/298))
- Stop the confirmation refresh cron when transaction re-validation fails ([#282](https://github.com/MetaMask/internal-snaps/pull/282))
  - Show the mapped transaction error banner
  - Skip the security scan for the invalid transaction
  - Do not reschedule further refresh cycles
- Fill contract-based receive transactions in history instead of marking them as unknown ([#255](https://github.com/MetaMask/internal-snaps/pull/255))

## [0.1.0]

### Added

- Initial package release ([#181](https://github.com/MetaMask/internal-snaps/pull/181))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@0.1.0...@metamask/stellar-wallet-snap@1.0.0
[0.1.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/stellar-wallet-snap@0.1.0
