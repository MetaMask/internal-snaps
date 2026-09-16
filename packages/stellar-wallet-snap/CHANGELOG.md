# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- Add `signProofOfOwnershipBatch` for signing multiple proof-of-ownership messages in one request. ([#267](https://github.com/MetaMask/internal-snaps/pull/267))
- Add `signProofOfOwnership` client request for silent proof-of-ownership signing (SEP-0053) ([#186](https://github.com/MetaMask/internal-snaps/pull/186))
- Add `exportAccount` keyring method for base32 Stellar secret-seed export ([#187](https://github.com/MetaMask/internal-snaps/pull/187))
- Add `@metamask/snap-networks-utils` `^1.0.0` ([#182](https://github.com/MetaMask/internal-snaps/pull/182))

### Changed

- **BREAKING** Bump `@metamask/keyring-api` from `^23.7.0` to `^24.1.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/keyring-snap-sdk` from `^9.2.1` to `^10.0.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/snaps-sdk` from `^11.2.0` to `^12.0.1` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- Show mapped transaction validation error banners in the ChangeTrustOpt and ConfirmSend confirmation dialogs ([#220](https://github.com/MetaMask/internal-snaps/pull/220), [#185](https://github.com/MetaMask/internal-snaps/pull/185))
  - Mapped errors cover insufficient balance, expired transactions, destination memo requirements, invalid create-account amount or asset, and trustline failures (not authorized, missing on sender or destination, over destination limit, non-zero balance on remove, or new limit below current balance).
  - Unmapped errors fall back to a generic cannot-complete message.
  - Skip destination validation in `onAmountInput`.

### Removed

- **BREAKING** Remove the deprecated `asset` cluster of handlers: `onAssetHistoricalPrice`, `onAssetsConversion`, `onAssetsLookup`, and `onAssetsMarketData` ([#262](https://github.com/MetaMask/internal-snaps/pull/262), [#286](https://github.com/MetaMask/internal-snaps/pull/286), [#299](https://github.com/MetaMask/internal-snaps/pull/299))

### Fixed

- Skip unrecognized activity that is not from this wallet's inner source account, such as fee-bump and claim-balance transactions for other accounts ([#298](https://github.com/MetaMask/internal-snaps/pull/298))
- Show the mapped transaction validation error banner when confirmation refresh re-validation fails ([#282](https://github.com/MetaMask/internal-snaps/pull/282))
  - Stop the confirmation refresh cron.
  - Skip the security scan.
- Fill contract-based receive transactions in history instead of marking them as unknown ([#255](https://github.com/MetaMask/internal-snaps/pull/255))

## [0.1.0]

### Added

- Initial package release ([#181](https://github.com/MetaMask/internal-snaps/pull/181))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@0.1.0...@metamask/stellar-wallet-snap@1.0.0
[0.1.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/stellar-wallet-snap@0.1.0
