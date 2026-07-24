# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add support for keyring API v2, including `bip44:derive-path`, `bip44:derive-index`, `bip44:derive-index-range`, and `bip44:discover` account creation types ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Add `exportAccount` method supporting WIF (base58) private key export ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Add `parseDerivationPath` to validate and parse BIP-44 derivation paths for native segwit (BIP-84) accounts ([#43](https://github.com/MetaMask/internal-snaps/pull/43))

### Changed

- Migrate `KeyringHandler` to implement `KeyringSnapRpc` from `@metamask/keyring-api/v2` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Update `snap.manifest.json` to declare `derivePath` capability in the `bip44` keyring block ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Mark accounts as exportable in the keyring account mapping ([#43](https://github.com/MetaMask/internal-snaps/pull/43))

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
