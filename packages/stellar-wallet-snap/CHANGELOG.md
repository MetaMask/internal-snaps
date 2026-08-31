# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

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
