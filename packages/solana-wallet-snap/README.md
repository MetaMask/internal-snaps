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

`signPackPartnerBuy` adds the selected account's signature to a Pack Partner presigned purchase transaction. It is available only through `onClientRequest`, never through dapp RPC, keyring or multichain requests. It returns `{ signedTransaction, signature }` (base64 wire bytes and the base58 first signature), without broadcasting or opening a second confirmation screen. Buyback signing is not exposed yet.

The client handler validates the request and resolves the keyring account. `WalletService` delegates to the stateless `PackPartnerSigner`, which uses the existing `SolanaConnection`, codecs and key derivation. It does not fetch offers, keep a purchase journal or expose a balance API.

### Request and Mobile responsibilities

All fields are required, and unknown fields are rejected:

| Field            | Contract                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `accountId`      | Existing keyring account whose scopes include the requested network.                                          |
| `scope`          | Mainnet or Devnet Solana CAIP-2 scope. Testnet, Localnet and unknown scopes are rejected.                     |
| `transaction`    | Canonical base64 wire transaction with a valid partner presignature and no user signature.                    |
| `context.amount` | Positive u64 integer string in USDC base units (six decimals); no floating-point numbers or policy overrides. |

Mobile confirms the amount, selects the matching API/network, submits the signed response and owns recovery. Guard failure must never fall back to another signer. A purchase signs only the USDC payment: Pack Partner selects and delivers the NFT later through `openPack`, which the Snap cannot guarantee. Mobile's current opening request passes only the memo; a future `altPlayerAddress` must remain absent or equal the confirmed wallet. Balance reads remain in Mobile, through the asset controller on mainnet and asset API client on devnet.

### Network policy and invariants

Mainnet and Devnet use the same validation code and separate hardcoded `PACK_PARTNER_NETWORK_CONFIGS` policies. The Snap selects the trusted signers, memo programs and USDC mint; callers cannot override them. An unconfigured network fails before RPC access or key derivation. Devnet uses the test mint `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`, not mainnet USDC.

- Signer and memo-program allowlists rotate independently. Exactly two signatures are required: the user and one configured partner. The partner must have signed the exact message; all payment accounts are tied to that authenticated signer.
- Exactly one checked USDC transfer debits the confirmed amount from the user's canonical token account to the partner's canonical token account. The configured mint, six decimals, authority and simulated user debit must agree.
- The network fee payer may be the user or partner. When the user pays, network and priority fees must total at most `PACK_PARTNER_MAX_FEE` (100,000 lamports, 0.0001 SOL). When the partner pays, the Snap skips the fee quote and verifies that the user spends zero SOL. A sponsored user need not hold SOL.
- Only the reviewed payment, memo and compute-budget instructions are accepted. Extra transfers, authority changes, unexpected accounts and address lookup tables are rejected.
- The exact presigned message must simulate successfully with complete account snapshots and an unexpired blockhash. No blockhash replacement is performed. Only then is the private key derived and the unchanged message signed.
- Shared partner SOL/USDC balances can change between independent reads. The authenticated transfer and exact user delta prove the amount; token ownership and authority remain checked. All other accounts must remain unchanged.

The private orchestrator runs `#prepareTransaction`, `#validateInstructions`, `#simulateTransaction`, `#validateEffects`, then `#signTransaction`. No stage is exposed separately. RPC, simulation or guard failures cannot return signed bytes.

### Tests and maintenance

`PackPartnerSigner.buy.test.ts` covers valid purchases, both fee payers, sponsorship without SOL, amount binding, network isolation and rotation, malformed instructions, simulation failures and unexpected effects. Client-handler and entrypoint tests cover required parameters, account scope and refusal through dapp/keyring/multichain entrypoints.

`PackPartnerSigner.historical-transactions.test.ts` checks authentic purchase presignatures and instruction templates up to the first account-snapshot request. It does not replay historical chain state. Full signing tests use synthetic keys and mocked RPC; no live purchase is made.

```bash
yarn workspace @metamask/solana-wallet-snap exec vitest run src/core/services/pack-partner src/core/handlers/onClientRequest/ClientRequestHandler.packPartner.test.ts src/packPartner.test.ts
```

Full-package validation uses the package test suite, TypeScript, lint and changelog checks. Never lower coverage thresholds to accommodate a guard change. Before enabling another network or transaction format, review its anchors and authentic transactions, add positive/adversarial tests and synchronize the contract with Mobile.

## Running the snap locally

```bash
yarn start
```

## Contributing

This package is part of the Internal Snaps monorepo. See the [contribution processes](../../docs/processes/) for development, testing, building, and release instructions.
