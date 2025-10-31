# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.1]

### Fixed

- Use the correct `index` field instead of `groupIndex` for account creation ([#67](https://github.com/MetaMask/snap-tron-wallet/pull/67))

## [1.6.0]

### Added

- Implement `setSelectedAccounts` handler ([#63](https://github.com/MetaMask/snap-tron-wallet/pull/63))

### Fixed

- Adjust `timestamp` fields' precision to be in seconds, not milliseconds ([#64](https://github.com/MetaMask/snap-tron-wallet/pull/64))

## [1.5.4]

### Fixed

- Use the correct hexadecimal format private key (excluding the `0x` prefix) when using TronWeb ([#61](https://github.com/MetaMask/snap-tron-wallet/pull/61))

## [1.5.3]

### Fixed

- Make field `visible` configurable by caller on the `signAndSendTransaction` handler ([#59](https://github.com/MetaMask/snap-tron-wallet/pull/59))

## [1.5.2]

### Fixed

- Add missing fields on `signAndSendTransaction`'s payload for Tron ([#57](https://github.com/MetaMask/snap-tron-wallet/pull/57))

## [1.5.1]

### Changed

- Send the metadata for the max bandwidth and energy values ([#55](https://github.com/MetaMask/snap-tron-wallet/pull/55))
- Modify `signAndSendTransaction` to properly handle base64 transactions ([#54](https://github.com/MetaMask/snap-tron-wallet/pull/54))

## [1.5.0]

### Added

- Implement staking and unstaking handlers ([#46](https://github.com/MetaMask/snap-tron-wallet/pull/46))

### Changed

- Match the new Keyring `createAccount` spec ([#52](https://github.com/MetaMask/snap-tron-wallet/pull/52))
- Implement safe error handling so that the Snap never crashes ([#51](https://github.com/MetaMask/snap-tron-wallet/pull/51))

## [1.4.0]

### Fixed

- Edit assets names and balance decimals ([#49](https://github.com/MetaMask/snap-tron-wallet/pull/49))
- Send maximum Bandwidth and Energy as assets ([#42](https://github.com/MetaMask/snap-tron-wallet/pull/42))

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

[Unreleased]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.6.1...HEAD
[1.6.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.5.4...v1.6.0
[1.5.4]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/MetaMask/snap-tron-wallet/releases/tag/v1.0.0
