# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Extract Snap-owned balance fetch/persist/read logic into `SnapAssetsAdapter`; `AssetsService` delegates account asset reads and saves through the adapter (no Core routing yet).
- Align `AssetsService` read API with `snap-networks-utils` / AssetsController shapes by adding `getAccountAssetByID`, `getAccountAssetsByIDs`, `getAccountAssetsByScope`, and `getAccountAssetsForAllActiveScopes`, and routing Keyring, Send, send render, and `refreshSend` through them (still Snap-owned storage). ([#120](https://github.com/MetaMask/internal-snaps/pull/120))
- This package was migrated from [snap-solana-wallet](https://github.com/MetaMask/snap-solana-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-solana-wallet/blob/main/packages/snap/CHANGELOG.md). ([#72](https://github.com/MetaMask/internal-snaps/pull/72))

[Unreleased]: https://github.com/MetaMask/internal-snaps/
