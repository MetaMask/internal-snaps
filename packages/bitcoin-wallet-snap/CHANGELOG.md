# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/snaps-cli` from `^8.3.0` to `^8.4.1` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/keyring-api` from `^23.2.0` to `^23.7.0` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/keyring-snap-sdk` from `^8.0.0` to `^9.2.1` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/snaps-sdk` from `11.1.1` to `11.2.0` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))

## [1.15.2]

### Fixed

- Fixed RPC endpoints for mainnet and testnet ([#37](https://github.com/MetaMask/internal-snaps/pull/37))
  - Endpoints introduced in version `1.15.1` were causing frequent 429 HTTP errors.

## [1.15.1]

### Changed

- This package was migrated from [snap-bitcoin-wallet](https://github.com/MetaMask/snap-bitcoin-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-bitcoin-wallet/blob/main/packages/snap/CHANGELOG.md).

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@1.15.2...HEAD
[1.15.2]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@1.15.1...@metamask/bitcoin-wallet-snap@1.15.2
[1.15.1]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/bitcoin-wallet-snap@1.15.1
