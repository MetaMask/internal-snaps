# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0]

### Added

- Add missing "sync transactions" background event ([#44](https://github.com/MetaMask/snap-tron-wallet/pull/44))
- Implement account synchronization when transactions happen ([#38](https://github.com/MetaMask/snap-tron-wallet/pull/38))
- Add new required fields to KeyringAccount objects ([#41](https://github.com/MetaMask/snap-tron-wallet/pull/41))
- Implement `computeFee` handler ([#40](https://github.com/MetaMask/snap-tron-wallet/pull/40))

## [1.2.0]

### Added

- `signAndSendTransaction` client request ([#34](https://github.com/MetaMask/snap-tron-wallet/pull/34))

## [1.1.1]

### Added

- Fetch token metadata from Token API instead of Trongrid ([#31](https://github.com/MetaMask/snap-tron-wallet/pull/31))

### Fixed

- Price and market data request failures from passing Energy, Bandwidth and other unsupported assets to the API calls directly ([#32](https://github.com/MetaMask/snap-tron-wallet/pull/32))

## [1.1.0]

### Added

- Implement "Unified Non-EVM Send" spec ([#28](https://github.com/MetaMask/snap-tron-wallet/pull/28))
- Send Staked TRX positions as assets ([#29](https://github.com/MetaMask/snap-tron-wallet/pull/29))
- Send Energy and Bandwidth as assets ([#27](https://github.com/MetaMask/snap-tron-wallet/pull/27))
- Implement `discoverAccounts` keyring method ([#26](https://github.com/MetaMask/snap-tron-wallet/pull/26))
- Support Energy and Bandwidth as transaction history fees ([#25](https://github.com/MetaMask/snap-tron-wallet/pull/25))
- Implement transaction history ([#19](https://github.com/MetaMask/snap-tron-wallet/pull/19))

## [1.0.3]

### Changed

- Clean unnecessary values ([#22](https://github.com/MetaMask/snap-tron-wallet/pull/22))

## [1.0.2]

### Changed

- Release config update

## [1.0.1]

### Added

- Enable corepack ([#17](https://github.com/MetaMask/snap-tron-wallet/pull/17))

## [1.0.0]

### Added

- Initial release of Tron wallet snap
- Support for TRX and token assets balances ([#12](https://github.com/MetaMask/snap-tron-wallet/pull/12))

[Unreleased]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/MetaMask/snap-tron-wallet/releases/tag/v1.0.0
