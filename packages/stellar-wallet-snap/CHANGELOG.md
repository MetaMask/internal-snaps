# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Resolve workspace `@metamask/*` TypeScript types from the monorepo root instead of assuming sibling directories ([#167](https://github.com/MetaMask/internal-snaps/pull/167))
- Set `baseUrl` in this package's `tsconfig.json` and restate the workspace `@metamask/*` path mapping relative to it, so the package keeps `baseUrl`-relative import ergonomics without losing correct workspace-source resolution
- This package was migrated from [snap-stellar-wallet](https://github.com/MetaMask/snap-stellar-wallet). See the source repository for the original [changelog](https://github.com/MetaMask/snap-stellar-wallet/blob/main/packages/snap/CHANGELOG.md) ([#161](https://github.com/MetaMask/internal-snaps/pull/161))

### Fixed

- Fixed a TypeScript error in the confirmation price refresher reducer ([#165](https://github.com/MetaMask/internal-snaps/pull/165))

[Unreleased]: https://github.com/MetaMask/internal-snaps/
