# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release/9.0.0 ([#240](https://github.com/MetaMask/internal-snaps/pull/240))
- refactor(snap-networks-utils): move util sources under `src/utils` ([#222](https://github.com/MetaMask/internal-snaps/pull/222))
- refactor(bitcoin-wallet-snap): convert enums to `as const` objects ([#216](https://github.com/MetaMask/internal-snaps/pull/216))
- fix: resolve `@metamask/snap-networks-utils` to source for typechecking ([#171](https://github.com/MetaMask/internal-snaps/pull/171))
- chore: replace bitcoin logger with shared util class ([#142](https://github.com/MetaMask/internal-snaps/pull/142))
- chore: update lint-build ci vars, add clean working dir check to release workflow ([#146](https://github.com/MetaMask/internal-snaps/pull/146))
- chore: ts issues fixes ([#139](https://github.com/MetaMask/internal-snaps/pull/139))

### Changed

- Split the chain `stopGap` configuration into `{ discovery: 5, scan: 20 }` so account discovery keeps the cheap probe while full account scans use the BIP44 gap limit ([#224](https://github.com/MetaMask/internal-snaps/pull/224))

### Fixed

- Ensure certain errors are stringified correctly ([#179](https://github.com/MetaMask/internal-snaps/pull/179))

## [2.0.1]

### Fixed

- Fix `onKeyringRequest` responses to correctly return `Json` directly (v2 protocol) instead of v1's `{ pending: false, result }` envelope ([#100](https://github.com/MetaMask/internal-snaps/pull/100))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.9` ([#161](https://github.com/MetaMask/internal-snaps/pull/161))

## [2.0.0] [DEPRECATED]

### Added

- Add support for keyring API v2, including `bip44:derive-path`, `bip44:derive-index`, `bip44:derive-index-range`, and `bip44:discover` account creation types ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Add `exportAccount` method supporting WIF (base58) private key export ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Add `parseDerivationPath` to validate and parse BIP-44 derivation paths for native segwit (BIP-84) accounts ([#43](https://github.com/MetaMask/internal-snaps/pull/43))

### Changed

- **BREAKING** Remove v1 keyring API support (`createAccount`, v1 `Keyring` interface) in favour of v2 ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- **BREAKING:** Re-licensed split into LICENSE.MIT or LICENSE.APACHE2 files (SPDX expression unchanged) ([#75](https://github.com/MetaMask/internal-snaps/pull/75))
- Migrate `KeyringHandler` to implement `KeyringSnapRpc` from `@metamask/keyring-api/v2` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Update `snap.manifest.json` to declare `derivePath` capability in the `bip44` keyring block ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Mark accounts as exportable in the keyring account mapping ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-cli` from `^8.3.0` to `^8.4.1` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/keyring-api` from `^23.2.0` to `^23.7.0` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/keyring-snap-sdk` from `^8.0.0` to `^9.2.1` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))
- Bump `@metamask/snaps-sdk` from `11.1.1` to `11.2.0` ([#56](https://github.com/MetaMask/internal-snaps/pull/56))

## [1.15.2]

### Fixed

- Fixed RPC endpoints for mainnet and testnet ([#37](https://github.com/MetaMask/internal-snaps/pull/37))
  - Endpoints introduced in version `1.15.1` were causing frequent 429 HTTP errors.

## [1.15.1] [DEPRECATED]

### Changed

- This package was migrated from [snap-bitcoin-wallet](https://github.com/MetaMask/snap-bitcoin-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-bitcoin-wallet/blob/main/packages/snap/CHANGELOG.md).

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@2.0.1...HEAD
[2.0.1]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@2.0.0...@metamask/bitcoin-wallet-snap@2.0.1
[2.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@1.15.2...@metamask/bitcoin-wallet-snap@2.0.0
[1.15.2]: https://github.com/MetaMask/internal-snaps/compare/@metamask/bitcoin-wallet-snap@1.15.1...@metamask/bitcoin-wallet-snap@1.15.2
[1.15.1]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/bitcoin-wallet-snap@1.15.1
