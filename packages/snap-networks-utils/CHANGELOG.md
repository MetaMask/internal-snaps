# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add package scaffold with an example `logger` module for shared network-snap utilities ([#79](https://github.com/MetaMask/internal-snaps/pull/79))
- Add shared `AssetsService` under `services/assets` for Core AssetsController reads, plus `mapControllerAsset` and `toUiAmount` helpers ([#82](https://github.com/MetaMask/internal-snaps/pull/82))

### Changed

- Bump `@metamask/assets-controller` to `^13.0.0` ([core#9740](https://github.com/MetaMask/core/pull/9740)) and call the renamed lookup actions (`getAccountAssetByID`, `getAccountAssetsByIDs`, `getAccountAssetsByScope`) ([#82](https://github.com/MetaMask/internal-snaps/pull/82))
- Add `AssetsServiceMessenger` types and tighten `AssetsService` signatures to use `Caip19AssetId` ([#82](https://github.com/MetaMask/internal-snaps/pull/82))

[Unreleased]: https://github.com/MetaMask/internal-snaps/
