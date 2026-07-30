# Solana Wallet Snap

This package contains the source code for the Solana Wallet Snap - a MetaMask Snap that enables Solana blockchain functionality directly within your MetaMask wallet. The Snap allows users to:

- Create and manage Solana accounts
- View SOL and SPL token balances
- Sign messages and transactions
- Send and receive transactions
- Connect to Solana dApps

The Snap is built using the MetaMask Snaps SDK and integrates with Solana's web3.js library for blockchain interactions. It follows best practices for security and provides a seamless user experience within the familiar MetaMask interface.

![Hero Illustration](./docs/hero.png)

## Installation

```bash
npm install @metamask/solana-wallet-snap
# or
yarn add @metamask/solana-wallet-snap
```

## Configuration

Copy `.env.sample` to `.env` and configure it as needed.

## Running the snap locally

```bash
yarn start
```

## Contributing

This package is part of the Internal Snaps monorepo. See the [contribution processes](../../docs/processes/) for development, testing, building, and release instructions.
