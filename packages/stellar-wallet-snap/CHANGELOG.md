# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Uncategorized

- chore(stellar): tighten chain id type + centralize `parseCaipAssetType` method call ([#504](https://github.com/MetaMask/internal-snaps/pull/504))
- chore(stellar): tighten asset metadata type ([#503](https://github.com/MetaMask/internal-snaps/pull/503))
- feat(stellar): unify refresher key resolution for open and save flows ([#378](https://github.com/MetaMask/internal-snaps/pull/378))
- chore(stellar): add testing cli script ([#497](https://github.com/MetaMask/internal-snaps/pull/497))
- chore(stellar): use BaseTransactionScanService from shared lib ([#476](https://github.com/MetaMask/internal-snaps/pull/476))
- feat(solana-wallet-snap): add Core messenger plumbing for AssetsProvider ([#485](https://github.com/MetaMask/internal-snaps/pull/485))

### Added

- Read asset metadata from AssetsController when feature flag `enableAssetMigration` and local flag `enableAssetMigration` is on ([#493](https://github.com/MetaMask/internal-snaps/pull/493))
  - `enableAssetMigration` set to off.

### Changed

- **BREAKING:** Stop falling back to Soroban RPC and Horizon for asset metadata ([#505](https://github.com/MetaMask/internal-snaps/pull/505))
  - Fetch asset metadata from the local catalog or the mainnet token API.
- **BREAKING:** Return classic keyring balance metadata `limit` in integer stroop string ([#495](https://github.com/MetaMask/internal-snaps/pull/495))
  - Keyring method `getAccountBalances` and the Keyring event `AccountBalancesUpdated` now return this `limit` in stroops.

### Fixed

- Keep in-progress memo edits in `memoDraft` so Back does not commit unsaved memo text on send confirmation. ([#406](https://github.com/MetaMask/internal-snaps/pull/406))

## [1.3.0]

### Added

- Add `sponsored` to classic keyring balance metadata ([#471](https://github.com/MetaMask/internal-snaps/pull/471))
- Treat StellarExpert SEP-37 `memo-required` directory addresses as memo-required alongside SEP-29 ([#489](https://github.com/MetaMask/internal-snaps/pull/489))

### Changed

- Keep `onAmountInput` valid when a classic amount would exceed the sender's trustline limit ([#469](https://github.com/MetaMask/internal-snaps/pull/469))

## [1.2.0]

### Changed

- Bump `@stellar/stellar-sdk` from `^17.0.1` to `^17.2.1` ([#435](https://github.com/MetaMask/internal-snaps/pull/435))

### Fixed

- Fail transaction submit on Soroban RPC `TRY_AGAIN_LATER` instead of treating it as success ([#451](https://github.com/MetaMask/internal-snaps/pull/451))
- Hot-reload the token API asset catalog during account sync when the last catalog sync has expired, so newly listed SEP-41 tokens appear without waiting for the hourly `synchronizeAssets` cron ([#448](https://github.com/MetaMask/internal-snaps/pull/448))
- Preserve Soroban `sorobanData` when rebuilding a transaction after `txBadSeq` so SEP-41 sends can retry successfully ([#444](https://github.com/MetaMask/internal-snaps/pull/444))
- Allow up to a 100% network-fee increase after confirmation and show the latest fee estimate on the confirmation dialog ([#447](https://github.com/MetaMask/internal-snaps/pull/447))
- Use generic security-alert copy instead of Blockaid `description` ([#433](https://github.com/MetaMask/internal-snaps/pull/433))

## [1.1.1]

### Fixed

- Hide send-confirmation memo controls for SEP-41 assets and skip SEP-29 RequiresMemo recovery on `invokeHostFunction` transactions ([#385](https://github.com/MetaMask/internal-snaps/pull/385))

## [1.1.0]

### Added

- Add send confirmation memo UI for SEP-29 RequiresMemo recovery ([#323](https://github.com/MetaMask/internal-snaps/pull/323), [#360](https://github.com/MetaMask/internal-snaps/pull/360), [#289](https://github.com/MetaMask/internal-snaps/pull/289))
  - Rebuild the transaction after the memo is entered.
  - Pause background confirmation refresh while a memo is required, and restart it after the memo is added.
- Add `signProofOfOwnershipBatch` for signing multiple proof-of-ownership messages in one request ([#267](https://github.com/MetaMask/internal-snaps/pull/267))

### Changed

- Bump `@stellar/stellar-sdk` from `^15.0.1` to `^17.0.1` ([#302](https://github.com/MetaMask/internal-snaps/pull/302), [#307](https://github.com/MetaMask/internal-snaps/pull/307), [#349](https://github.com/MetaMask/internal-snaps/pull/349))
  - Show distinct confirmation titles for each revoke-sponsorship operation type on `signTransaction`.
  - Accept CAP-71 v2 Soroban authorization preimages on `signAuthEntry`, show `ADDRESS_V2` credential addresses, and reject when the v2 bound address is not the signing account.
  - Show decoded `createContract` / `createContractV2` confirmation rows on `signTransaction` and `signAuthEntry`.
- Emit transaction analytics from `signTransaction`, `ConfirmSend`, and `ChangeTrustOpt` ([#346](https://github.com/MetaMask/internal-snaps/pull/346), [#345](https://github.com/MetaMask/internal-snaps/pull/345))
  - Emit `Transaction Added`, `Transaction Approved`, and `Transaction Rejected` from the `signTransaction` confirmation.
  - Emit `Transaction Submitted` from the `ConfirmSend` and `ChangeTrustOpt` flows.

### Fixed

- Rename confirmation network labels from `Mainnet` and `Testnet` to `Stellar Mainnet` and `Stellar Testnet` ([#382](https://github.com/MetaMask/internal-snaps/pull/382))

## [1.0.0]

### Added

- Add `signProofOfOwnership` client request for silent proof-of-ownership signing (SEP-0053) ([#186](https://github.com/MetaMask/internal-snaps/pull/186))
- Add `exportAccount` keyring method for base32 Stellar secret-seed export ([#187](https://github.com/MetaMask/internal-snaps/pull/187))
- Add `@metamask/snap-networks-utils` `^1.0.0` ([#182](https://github.com/MetaMask/internal-snaps/pull/182))

### Changed

- **BREAKING** Bump `@metamask/keyring-api` from `^23.7.0` to `^24.1.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/keyring-snap-sdk` from `^9.2.1` to `^10.0.0` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- **BREAKING** Bump `@metamask/snaps-sdk` from `^11.2.0` to `^12.0.1` ([#214](https://github.com/MetaMask/internal-snaps/pull/214))
- Show mapped transaction validation error banners in the ChangeTrustOpt and ConfirmSend confirmation dialogs ([#220](https://github.com/MetaMask/internal-snaps/pull/220), [#185](https://github.com/MetaMask/internal-snaps/pull/185))
  - Mapped errors cover insufficient balance, expired transactions, destination memo requirements, invalid create-account amount or asset, and trustline failures (not authorized, missing on sender or destination, over destination limit, non-zero balance on remove, or new limit below current balance).
  - Unmapped errors fall back to a generic cannot-complete message.
  - Skip destination validation in `onAmountInput`.

### Removed

- **BREAKING** Remove the deprecated `asset` cluster of handlers: `onAssetHistoricalPrice`, `onAssetsConversion`, `onAssetsLookup`, and `onAssetsMarketData` ([#262](https://github.com/MetaMask/internal-snaps/pull/262), [#286](https://github.com/MetaMask/internal-snaps/pull/286), [#299](https://github.com/MetaMask/internal-snaps/pull/299))

### Fixed

- Skip unrecognized activity that is not from this wallet's inner source account, such as fee-bump and claim-balance transactions for other accounts ([#298](https://github.com/MetaMask/internal-snaps/pull/298))
- Show the mapped transaction validation error banner when confirmation refresh re-validation fails ([#282](https://github.com/MetaMask/internal-snaps/pull/282))
  - Stop the confirmation refresh cron.
  - Skip the security scan.
- Fill contract-based receive transactions in history instead of marking them as unknown ([#255](https://github.com/MetaMask/internal-snaps/pull/255))

## [0.1.0]

### Added

- Initial package release ([#181](https://github.com/MetaMask/internal-snaps/pull/181))

[Unreleased]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@1.3.0...@metamask/stellar-wallet-snap@2.0.0
[1.3.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@1.2.0...@metamask/stellar-wallet-snap@1.3.0
[1.2.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@1.1.1...@metamask/stellar-wallet-snap@1.2.0
[1.1.1]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@1.1.0...@metamask/stellar-wallet-snap@1.1.1
[1.1.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@1.0.0...@metamask/stellar-wallet-snap@1.1.0
[1.0.0]: https://github.com/MetaMask/internal-snaps/compare/@metamask/stellar-wallet-snap@0.1.0...@metamask/stellar-wallet-snap@1.0.0
[0.1.0]: https://github.com/MetaMask/internal-snaps/releases/tag/@metamask/stellar-wallet-snap@0.1.0
