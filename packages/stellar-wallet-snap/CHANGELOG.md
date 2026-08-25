# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `TrustlineExceedLimitException` for send simulation when a payment would exceed the destination trustline limit (previously a generic `TransactionValidationException`) ([#185](https://github.com/MetaMask/internal-snaps/pull/185))

- Add `@metamask/snap-networks-utils` `^1.0.0` ([#182](https://github.com/MetaMask/internal-snaps/pull/182))
  - Use the shared `Logger`

### Changed

- `createValidatedSendTransaction` now throws `InvalidAssetForCreateAccountException` instead of `AccountNotActivatedException` when sending a non-native asset to an unfunded destination ([#185](https://github.com/MetaMask/internal-snaps/pull/185))

## [0.1.0]

### Added

- Initial package release ([#181](https://github.com/MetaMask/internal-snaps/pull/181))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/stellar-wallet-snap@0.1.0
