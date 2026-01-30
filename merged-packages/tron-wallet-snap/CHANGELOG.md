# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Add pre-confirmation validation to `confirmSend` flow ([#179](https://github.com/MetaMask/snap-tron-wallet/pull/179))
  - Validates that the user has enough funds to cover both the amount and all associated fees (bandwidth, energy, account activation) before showing the confirmation dialog.
- Fix missing values in simulation API request ([#176](https://github.com/MetaMask/snap-tron-wallet/pull/176))
  - The wrong parameters sent to the simulation API were causing inaccurate estimations and false negatives.

## [1.19.3]

### Fixed

- Normalize locale string when showing simulation estimated changes ([#169](https://github.com/MetaMask/snap-tron-wallet/pull/169))

## [1.19.2]

### Added

- Display error message coming from transaction simulations ([#166](https://github.com/MetaMask/snap-tron-wallet/pull/166))

## [1.19.1]

### Changed

- Remove convertion layer for images displayed in Snaps UI ([#162](https://github.com/MetaMask/snap-tron-wallet/pull/162))

### Fixed

- Finalised word transformed to us-en ([#164](https://github.com/MetaMask/snap-tron-wallet/pull/164))
- Signing messages of 3 characters or less ([#161](https://github.com/MetaMask/snap-tron-wallet/pull/161))

## [1.19.0]

### Fixed

- Always include TRX fee as first result on `computeFee` ([#159](https://github.com/MetaMask/snap-tron-wallet/pull/159))
- Ignore `visible` in `handleComputeFee` field ([#158](https://github.com/MetaMask/snap-tron-wallet/pull/158))
- Address unsubmitable swaps from Bridgers ([#157](https://github.com/MetaMask/snap-tron-wallet/pull/157))

## [1.18.0]

### Added

- Add optional `srNodeAddress` param to `confirmStake` ([#154](https://github.com/MetaMask/snap-tron-wallet/pull/154))
- Implement token filtering by minimum USD value in `AssetsService` ([#152](https://github.com/MetaMask/snap-tron-wallet/pull/152))

### Fixed

- Use `sha256` from MM utils and remove pkey usage ([#151](https://github.com/MetaMask/snap-tron-wallet/pull/151))

## [1.17.0]

### Added

- Map TRC10 transaction history with metadata fetched onchain ([#141](https://github.com/MetaMask/snap-tron-wallet/pull/141))

### Fixed

- Address all `minor` level audit findings ([#149](https://github.com/MetaMask/snap-tron-wallet/pull/149))
- Address all `major` level audit findings ([#148](https://github.com/MetaMask/snap-tron-wallet/pull/148))
- Exclude permissive origins and permissions ([#145](https://github.com/MetaMask/snap-tron-wallet/pull/145))

## [1.16.1]

### Fixed

- Dapp connectivity confirmations ([#146](https://github.com/MetaMask/snap-tron-wallet/pull/146))

## [1.16.0]

### Added

- Integrate Blockaid transaction simulation ([#139](https://github.com/MetaMask/snap-tron-wallet/pull/139))

### Fixed

- Enhance FeeCalculatorService with fallback energy estimation to `feeLimit` ([#142](https://github.com/MetaMask/snap-tron-wallet/pull/142))
- Audit fixes ([#140](https://github.com/MetaMask/snap-tron-wallet/pull/140))
- Stop signing transactions before user confirmation ([#138](https://github.com/MetaMask/snap-tron-wallet/pull/138))

## [1.15.1]

### Changed

- Bump `keyring-api` to version 21.3.0 ([#136](https://github.com/MetaMask/snap-tron-wallet/pull/136))

## [1.15.0]

### Added

- Added `feeLimit` option for energy calculation in FeeCalculatorService ([#132](https://github.com/MetaMask/snap-tron-wallet/pull/132))
- Added `signTransaction` confirmation ([#131](https://github.com/MetaMask/snap-tron-wallet/pull/131))
- Added `signMessage` confirmation ([#130](https://github.com/MetaMask/snap-tron-wallet/pull/130))
- Allocate Tron power to Consensys' SR node ([#129](https://github.com/MetaMask/snap-tron-wallet/pull/129))
- Added compute staking fee ([#112](https://github.com/MetaMask/snap-tron-wallet/pull/112))

### Fixed

- `signTransaction` not rebuilding Tron transactions correctly after receiving them as input ([#128](https://github.com/MetaMask/snap-tron-wallet/pull/128))
- `computeFee` does not consider account activations ([#127](https://github.com/MetaMask/snap-tron-wallet/pull/127))
- Remove validation key from WalletService ([#126](https://github.com/MetaMask/snap-tron-wallet/pull/126))

## [1.14.0]

### Added

- Dapp connectivity methods (`sign{Message/Transaction}`) ([#124](https://github.com/MetaMask/snap-tron-wallet/pull/124))
- Client `signRewardsMessage` ([#119](https://github.com/MetaMask/snap-tron-wallet/pull/119))

### Changed

- Improve Send flow amount validation with fee estimation ([#123](https://github.com/MetaMask/snap-tron-wallet/pull/123))

### Fixed

- Det `isDev` to false ([#122](https://github.com/MetaMask/snap-tron-wallet/pull/122))

## [1.13.0]

### Changed

- Ensure only safe concurrent state operations ([#116](https://github.com/MetaMask/snap-tron-wallet/pull/116))

## [1.12.1]

### Fixed

- Continuous synchronization of accounts not starting until we locked and unlocked the client ([#117](https://github.com/MetaMask/snap-tron-wallet/pull/117))
- Could not send TRC20 tokens where decimals were `18` ([#115](https://github.com/MetaMask/snap-tron-wallet/pull/115))

## [1.12.0]

### Changed

- `computeFee` not calling `triggerConstantContract` with accurate parameters ([#113](https://github.com/MetaMask/snap-tron-wallet/pull/113))

## [1.11.0]

### Added

- Pending transaction when executing ([#110](https://github.com/MetaMask/snap-tron-wallet/pull/110))

## [1.10.1]

### Fixed

- `computeFee` error ([#108](https://github.com/MetaMask/snap-tron-wallet/pull/108))
- Map freeze/unfreeze txs ([#107](https://github.com/MetaMask/snap-tron-wallet/pull/107))

## [1.10.0]

### Fixed

- Compute fee accuracy ([#103](https://github.com/MetaMask/snap-tron-wallet/pull/103))
- Fix `getAccount` and `listAccounts` ([#105](https://github.com/MetaMask/snap-tron-wallet/pull/105))
- Don't remove tron resources from assets ([#104](https://github.com/MetaMask/snap-tron-wallet/pull/104))

## [1.9.1]

### Fixed

- Use available `triggerConstantContract` instead of `estimateEnergy` ([#101](https://github.com/MetaMask/snap-tron-wallet/pull/101))
- Use mutex for state blob modifications ([#93](https://github.com/MetaMask/snap-tron-wallet/pull/93))

## [1.9.0]

### Added

- Track transaction when executed and map `failed` and `swap` transactions ([#98](https://github.com/MetaMask/snap-tron-wallet/pull/98))

### Fixed

- Dont allow clients requesting assets for tesnets ([#99](https://github.com/MetaMask/snap-tron-wallet/pull/99))

## [1.8.1]

### Added

- Bandwidth and Energy confirmation logos ([#95](https://github.com/MetaMask/snap-tron-wallet/pull/95))

### Fixed

- `computeFee` was returning in SUN and inaccurate values ([#84](https://github.com/MetaMask/snap-tron-wallet/pull/84))

## [1.8.0]

### Added

- Confirmation UI (#86) ([#86](https://github.com/MetaMask/snap-tron-wallet/pull/86))
- Transactions analytics ([#90](https://github.com/MetaMask/snap-tron-wallet/pull/90))
- Add `from` and `to` to confirmation ([#88](https://github.com/MetaMask/snap-tron-wallet/pull/88))

### Fixed

- Remove logs ([#87](https://github.com/MetaMask/snap-tron-wallet/pull/87))

## [1.7.4]

### Fixed

- Unstake method was doing incorrect input validation ([#82](https://github.com/MetaMask/snap-tron-wallet/pull/82))

## [1.7.3]

### Added

- Use Infura urls ([#75](https://github.com/MetaMask/snap-tron-wallet/pull/75))

## [1.7.2]

### Added

- Use Infura for all API dependencies ([#75](https://github.com/MetaMask/snap-tron-wallet/pull/75))

### Fixed

- Return transaction history fees in TRX not in SUN ([#77](https://github.com/MetaMask/snap-tron-wallet/pull/77))
- `computeFee` method needs to reconstruct Tron transactions the same way `signAndSendTransaction` does ([#77](https://github.com/MetaMask/snap-tron-wallet/pull/77))
- Adjust decimals when sending TRC20 tokens ([#76](https://github.com/MetaMask/snap-tron-wallet/pull/76))

## [1.7.1]

### Changed

- Remove unused "Localnet" ([#73](https://github.com/MetaMask/snap-tron-wallet/pull/73))

### Fixed

- Incorrect staked Tron amount due to not counting delegated TRX ([#73](https://github.com/MetaMask/snap-tron-wallet/pull/73))
- No initialized placeholder TRX value, nor special assets (Bandwidth, Energy) on accounts without TRX ([#73](https://github.com/MetaMask/snap-tron-wallet/pull/73))
- Staking methods need to convert amounts to sun ([#71](https://github.com/MetaMask/snap-tron-wallet/pull/71))

## [1.7.0]

### Changed

- Add `options` to the unstake method ([#69](https://github.com/MetaMask/snap-tron-wallet/pull/69))

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

[Unreleased]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.19.3...HEAD
[1.19.3]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.19.2...v1.19.3
[1.19.2]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.19.1...v1.19.2
[1.19.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.19.0...v1.19.1
[1.19.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.16.1...v1.17.0
[1.16.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.16.0...v1.16.1
[1.16.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.15.1...v1.16.0
[1.15.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.15.0...v1.15.1
[1.15.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.12.1...v1.13.0
[1.12.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.10.1...v1.11.0
[1.10.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.9.1...v1.10.0
[1.9.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.7.4...v1.8.0
[1.7.4]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.7.3...v1.7.4
[1.7.3]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.7.2...v1.7.3
[1.7.2]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/MetaMask/snap-tron-wallet/compare/v1.6.1...v1.7.0
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
