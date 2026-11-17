# Solana Wallet Snap

This package contains the source code for the Solana Wallet Snap - a MetaMask Snap that enables Solana blockchain functionality directly within your MetaMask wallet. The Snap allows users to:

- Create and manage Solana accounts
- View SOL and SPL token balances
- Sign messages and transactions
- Send and receive transactions
- Connect to Solana dApps

The Snap uses the MetaMask Snaps SDK and `@solana/kit` for blockchain interactions.

![Hero Illustration](./docs/hero.png)

## Installation

```bash
npm install @metamask/solana-wallet-snap
# or
yarn add @metamask/solana-wallet-snap
```

## Configuration

Copy `.env.sample` to `.env` and configure it as needed.

## Pack Partner signing (MetaMask client only)

`signPackPartnerBuy` and `signPackPartnerBuyback` add the selected account's signature to a Pack Partner presigned transaction. They are available only through `onClientRequest`, never through dapp RPC, keyring or multichain requests. They return `{ signedTransaction, signature }` (base64 wire bytes and the base58 first signature), without broadcasting or opening a second confirmation screen.

The existing client handler validates the request and resolves the account, `WalletService` delegates to `PackPartnerSigner`, and the signer uses the existing `SolanaConnection`, codecs and key derivation. This is a stateless validation/signing boundary; it does not fetch Pack Partner offers, maintain a purchase journal or provide a separate balance API.

`PackPartnerSigner.ts` is the single signing orchestrator. It owns transaction-wide checks, simulation and signing; `constants.ts` owns network policies. Both stay in `src/core/services/pack-partner/`.

Its private `#validateAndSign` method runs five stages in order:

1. `#prepareTransaction`: validate the intent/network, authenticate the presignature and resolve accounts.
2. `#validateInstructions`: check the allowed instructions and identify the expected NFT transfer accounts.
3. `#simulateTransaction`: read account state, check fees and simulate the exact presigned message.
4. `#validateEffects`: verify USDC, SOL and NFT changes and reject unexpected account mutations.
5. `#signTransaction`: derive the user's key and sign the unchanged message only after every guard passes.

These stages remain private to the signer. No stage can be invoked through a separate client method, and validation failures never fall through to signing. Existing signer tests exercise this complete sequence through `signBuy` and `signBuyback`.

The `nft-standards/` subfolder contains protocol validators and their colocated unit tests:

| Standard / buyback config key | Validator      | Protocol                        |
| ----------------------------- | -------------- | ------------------------------- |
| `core`                        | `core.ts`      | Metaplex Core                   |
| `nft`                         | `nft.ts`       | Token Metadata classic NFT      |
| `pnft`                        | `pnft.ts`      | Token Metadata programmable NFT |
| `cnft-core`                   | `cnft-core.ts` | Bubblegum V2 compressed NFT     |

Pack Partner's standard names are the source of truth across Mobile, Snap requests, configuration keys and validator file names. There are no internal aliases or naming mappings. Each validator has a matching colocated test file, such as `cnft-core.test.ts`. No validator imports another standard's validator. Shared program addresses live in `programs.ts`; `tokenMetadata.ts` holds the metadata decoder and transfer instruction definitions used by `nft` and `pnft`.

### Request and Mobile responsibilities

All fields below are required. Unknown fields, missing values and failed checks reject the request; there is no fallback to the generic signer.

| Field                                | Contract                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountId`                          | Existing Solana keyring account UUID. Its scopes must include the requested network; the Snap obtains the wallet address from this account.                                                                   |
| `scope`                              | Explicit Solana CAIP-2 network. No default network.                                                                                                                                                           |
| `transaction`                        | Canonical base64 wire transaction containing a valid Pack Partner presignature and no existing user signature.                                                                                                |
| `context.amount`                     | Exact USDC base units as a canonical positive decimal string: `25000000` means 25 USDC. Range `1`–`18446744073709551615` (u64). No token-decimal strings, numbers, signs, leading zeros or exponent notation. |
| `context.assetAddress` (buyback)     | Exact Core asset address, SPL-backed NFT mint or Bubblegum asset ID selected for sale.                                                                                                                        |
| `context.expectedStandard` (buyback) | `core`, `nft`, `pnft` or `cnft-core`. This selects a validator; it is not trusted evidence of the on-chain format. `unknown` is a rejected sentinel, not a supported standard.                                |

Mobile owns user confirmation, obtains the purchase price or fresh buyback refund in base units, and sends that exact intent to the Snap. It selects matching Pack Partner API URLs and Solana scope, submits only a successful signed response, and owns operation persistence/recovery. An unsupported guard format is a signing rejection, not permission to invoke another signer. Mobile distinguishes an absent client method (`SNAP_UNSUPPORTED`) from transaction/guard failures (`SIGNING_REJECTED`).

A pack purchase signs only its USDC payment. Pack Partner selects and delivers the NFT later through `openPack`; the Snap cannot prove that future delivery. Mobile's current `openPack` request passes only the memo. Any future `altPlayerAddress` option must remain absent or equal the confirmed wallet. Balance reading stays in Mobile: the normal asset controller on mainnet and the existing asset API client on devnet.

### Network policy

Mainnet and Devnet execute the same validation and signing code. The Snap selects a hardcoded policy from `PACK_PARTNER_NETWORK_CONFIGS` and passes the relevant asset profile to its validator. The caller cannot inject or override the policy. The presence of a `buyback` profile enables that standard; there is no second list of enabled formats to synchronize. Protocol program addresses are shared; provider signers, memo programs, USDC mint and reviewed collection/inventory anchors belong to each network's configuration.

| Network                                       | CAIP-2 scope                              | Purchases | Configured buyback profiles        |
| --------------------------------------------- | ----------------------------------------- | --------- | ---------------------------------- |
| Mainnet                                       | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Supported | `core`, `nft`, `pnft`, `cnft-core` |
| Devnet                                        | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | Supported | `cnft-core` only                   |
| Testnet, Localnet, unknown or missing network | —                                         | Rejected  | Rejected                           |

Missing network configuration or a missing buyback profile fails closed before RPC access/key derivation. Devnet `core`, `nft` and `pnft` buybacks remain disabled until their own anchors and transactions are reviewed; the shared implementation does not imply identical provider deployments. Never inherit mainnet anchors as a fallback. Devnet is distinct from Solana Testnet. The reviewed Devnet service uses the `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` test USDC mint.

The `signers` and `memoPrograms` allowlists rotate independently: old and new reviewed addresses can coexist during a migration. Each transaction must still require exactly two signatures, the user and one allowlisted provider with a valid Ed25519 presignature over the exact message. Every payment account must belong to that authenticated provider, not merely any other allowlisted signer. A new memo program must also satisfy the instruction and simulation checks. The current memo program is Solana Memo, not a Pack Partner payment authority.

### Validation invariants

These rules define the guard's tests as well as its implementation:

- **Exact financial intent.** One USDC transfer uses the configured mint and canonical user/provider token accounts. A purchase debits exactly the confirmed amount from the user; a buyback credits exactly the supplied refund and transfers the selected NFT out of the user's ownership. The decoded transfer and simulated user balance change must agree.
- **Bounded fees, either payer.** The network fee payer may be the user or authenticated provider, for purchases and buybacks. Network/priority fees plus the fixed Bubblegum transfer fee must total at most `PACK_PARTNER_MAX_FEE` (100,000 lamports, 0.0001 SOL). The user's SOL decreases only by their network fee; a sponsored user need not hold SOL. Bubblegum's protocol fee and any allowed USDC-account creation rent are provider-funded. Rent is an account deposit, separate from the fee cap.
- **Only reviewed effects.** Only the reviewed transfer, memo, compute-budget and optional provider-funded user-USDC-ATA instructions are accepted. Extra transfers, authority changes, unexpected accounts or writable roles, and address lookup tables are rejected. Standard-specific ownership, collection, metadata and account closure checks remain mandatory.
- **Simulation before signing.** The exact presigned message must simulate successfully on the requested network, with complete account results and an unexpired blockhash. Only then is the user's key derived and signature added. RPC failure, incomplete snapshots or any invariant failure cannot return signed bytes.
- **Concurrency without widening intent.** Independent RPC reads can observe unrelated provider activity. The shared provider SOL/USDC balances and Bubblegum fee-accumulator balance are not required to have exact deltas between reads; their ownership/authority/data checks, the single authenticated transfer, fee cap and exact user deltas still apply. Other accounts retain their required snapshot invariants.

### Reviewed NFT formats and limits

The provider contract defines the supported card standards below and also describes a separate buyback-program settlement route. This Snap validates the ordinary co-signed transaction from `POST /api/buyback`; it does not automatically accept the alternative program/quote route.

| Standard    | Reviewed transfer and checks                                                                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`      | MPL Core `TransferV1`, configured collection/inventory, expected owner change. Provider-funded creation of the user's USDC ATA is allowed.                                                                                                                                               |
| `pnft`      | Token Metadata `TransferV1`, configured collection/inventory and programmable token records, exact unchecked SPL USDC refund, user's NFT token account closed to the provider.                                                                                                           |
| `nft`       | Token Metadata `TransferV1`, configured verified collection and mint. The presignature binds the recipient; its canonical NFT account must already exist with zero NFTs, then receive exactly one. Checked USDC refund and source account closure to the provider are required.          |
| `cnft-core` | Bubblegum V2 `transferV2`, configured Core collection, asset-ID/tree/nonce derivation and selected user as owner/signing authority. The provider presignature binds the recipient. The canonical on-chain program must validate the Merkle proof and leaf replacement during simulation. |

Classic and programmable NFTs use the same Token Metadata program. A pNFT adds programmable transfer rules and token records to that NFT model; it is not a separate program. Sharing protocol definitions does not mean sharing their distinct validation rules. See Metaplex's [Token Metadata token standards](https://www.metaplex.com/docs/smart-contracts/token-metadata/token-standard).

Bubblegum V2 uses a Core collection to group compressed NFTs, but transfers their Merkle-tree leaves through Bubblegum, not through a Core NFT transfer. Its Core program reference therefore comes from the shared address definitions, not the Core NFT validator. See Metaplex's [Bubblegum V2 FAQ](https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/faq).

Compressed transfers accept only absent/zero flags and the user delegate or omitted-delegate sentinel. Other delegates, omitted collections, frozen/nontransferable assets, Bubblegum V1 and unreviewed templates are refused. No DAS client or off-chain Merkle verifier is introduced. The potentially large tree is excluded from full snapshots; a zero-data read verifies its compression-program ownership, while the validated transfer and successful simulation authorize its mutation. The tree configuration must retain its owner/data.

The compressed validator follows Metaplex's [instruction layout](https://github.com/metaplex-foundation/mpl-bubblegum/blob/main/clients/js/src/generated/instructions/transferV2.ts), [on-chain transfer checks](https://github.com/metaplex-foundation/mpl-bubblegum/blob/main/programs/bubblegum/program/src/processor/transfer.rs), and [fixed 6,000-lamport transfer fee](https://github.com/metaplex-foundation/mpl-bubblegum/blob/main/programs/bubblegum/program/src/state/collect.rs).

### Tests and maintenance

| Test boundary               | Evidence                                                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client/entrypoints          | Required fields, amounts, account scope, extra-field refusal and rejection through dapp/keyring/multichain entrypoints.                                                                                                                                                                       |
| Signer and asset validators | Valid purchases/refunds, both fee payers, zero-SOL sponsorship, exact amount/asset binding, network isolation/rotation, malformed instructions, account-effect and simulation failures. Transaction-validation failures stop before key derivation; no rejected request returns signed bytes. |
| Historical fixtures         | Authentic provider presignatures and observed instruction templates, checked up to the first account-snapshot request; they do not replay historical chain state.                                                                                                                             |
| Mobile integration          | Matching account/scope/asset/amount reach the Snap; signing rejection stops submission. Snap execution is mocked at this boundary.                                                                                                                                                            |

The signer suites stay beside `PackPartnerSigner.ts` because they exercise the complete transaction workflow, including USDC payment/refund, fees, RPC simulation and signing. `PackPartnerSigner.buy.test.ts` covers purchases and shared guards; `PackPartnerSigner.buyback.core.test.ts`, `.buyback.nft.test.ts`, `.buyback.pnft.test.ts` and `.buyback.cnft-core.test.ts` cover each buyback format. Tests inside `nft-standards/` cover the individual validators and shared protocol helpers.

Historical fixtures are kept in `src/core/services/pack-partner/PackPartnerSigner.historical-transactions.test.ts`, including [Mainnet pNFT](https://solscan.io/tx/2UgRzKR9ixnc9tPNpVQvArKZxqj7w7wCxbnv4Q5j7bX53fspySiuWwgZdgcNugK6LRZLZWdzT5uwMD6SeeNgcELe), classic NFT [Pokémon](https://solscan.io/tx/3fhT71ykVsxVALjpmriH5gBXM1M34hYNXx9Cy6Tcev2HQwfRcrNRN69rfsWsP5u29MraiC75VtmCbAVwCuqZEfEs) and [comics](https://solscan.io/tx/4xNjr79ss5zHmdhokUBwPDzF2yRJyFn9E2MeWeKMZXJJLuE7GAeLw8njuYLxH6JZZu1yL8Z2dGAsE5fwNp5YcnaG), and an ordinary [Devnet cNFT buyback](https://explorer.solana.com/tx/GWqYLJgJxmhK9jb1zKm9wSKp4sSLv25UK5u1QxxVfy33CmFjSfzmoeWzvXdf66igfMMAjNzWkno5bUdhTewk1wG?cluster=devnet) with a provider-funded idempotent USDC ATA instruction. Full signing/effect tests use synthetic keys and mocked RPC; Devnet purchases are covered synthetically. These tests do not perform new live purchases/sales or establish that every future provider transaction is compatible.

Run guard and client-boundary tests from the repository root:

```bash
yarn workspace @metamask/solana-wallet-snap exec vitest run src/core/services/pack-partner src/core/handlers/onClientRequest/ClientRequestHandler.packPartner.test.ts src/packPartner.test.ts
```

`src/packPartner.test.ts` exercises the real entrypoints independently of the legacy `installSnap` tests excluded from Vitest. Full-package checks use `yarn workspace @metamask/solana-wallet-snap run test`, package TypeScript/lint checks and changelog validation. The shared Vitest configuration only raises coverage thresholds during local `yarn test` runs; never lower them to accommodate a guard change.

When adding a network, rotating addresses or accepting another template, review authentic transactions first, update the pinned network profiles in `constants.ts`, add positive/adversarial fixtures, and synchronize this contract with Mobile. Changing metadata alone must never enable an unreviewed signing path.

## Running the snap locally

```bash
yarn start
```

## Contributing

This package is part of the Internal Snaps monorepo. See the [contribution processes](../../docs/processes/) for development, testing, building, and release instructions.
