# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **BREAKING** Implement Keyring API v2 (`KeyringSnapRpc` interface): rename `listAccounts` → `getAccounts`, `listAccountAssets` → `getAccountAssets`, `listAccountTransactions` → `getAccountTransactions`; `getAccount` now throws instead of returning `undefined`; add `exportAccount` with hexadecimal private key export using `sensitive()` for redaction; remove v1-only methods `createAccount`, `discoverAccounts`, `filterAccountChains`, and `updateAccount`.
- Add `bip44:discover` support to `createAccounts`: checks on-chain activity across all Tron networks before persisting; returns `[]` if no activity to signal end-of-discovery to the client.
- Add `endowment:keyring` capabilities to manifest declaring the `tron:728126428` scope, hexadecimal private key export, and BIP-44 derivation strategies.

### Changed

- Bump `@metamask/keyring-api` from `^23.2.0` to `^23.7.0` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/keyring-snap-sdk` from `^8.0.0` to `^9.2.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-cli` from `^8.3.0` to `^8.4.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/snaps-sdk` from `^11.1.1` to `^11.2.0` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))
- Bump `@metamask/superstruct` from `^3.2.1` to `^3.4.1` ([#43](https://github.com/MetaMask/internal-snaps/pull/43))

## [1.33.2]

### Changed

- This package was migrated from [snap-tron-wallet](https://github.com/MetaMask/snap-tron-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-tron-wallet/blob/main/packages/snap/CHANGELOG.md). ([#45](https://github.com/MetaMask/internal-snaps/pull/45))
- Changed the package license from dual MIT-0/Apache-2.0 licensing to a single MIT license. ([#50](https://github.com/MetaMask/internal-snaps/pull/50))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/tron-wallet-snap@1.33.2...HEAD
[1.33.2]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/tron-wallet-snap@1.33.2
