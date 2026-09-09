# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `recoverable` confirmation-refresh outcome for send-flow SEP-29 RequiresMemo (`confirmSend`): omit scan this cycle without nulling `securityScanRequest`, pause auto-cron until UI reschedules ([#291](https://github.com/MetaMask/internal-snaps/pull/291))
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

- Stop the confirmation refresh cron when transaction re-validation fails ([#282](https://github.com/MetaMask/internal-snaps/pull/282))
  - Show the mapped transaction error banner
  - Skip the security scan for the invalid transaction
  - Do not reschedule further refresh cycles
- Fill contract-based receive transactions in history instead of marking them as unknown ([#255](https://github.com/MetaMask/internal-snaps/pull/255))

## [0.1.0]

### Added

- Initial package release ([#181](https://github.com/MetaMask/internal-snaps/pull/181))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/stellar-wallet-snap@0.1.0
