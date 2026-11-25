# Xrpl Wallet Snap

MetaMask Snap that implements Xrpl account management, signing, sends, trustlines, and related multichain client APIs.

## Installation

```bash
npm install @metamask/xrpl-wallet-snap
# or
yarn add @metamask/xrpl-wallet-snap
```

## Configuration

Rename `.env.example` to `.env`. Runtime settings are loaded from `.env`.

## API examples

### `keyring_createAccount`

```typescript
provider.request({
  method: 'wallet_invokeKeyring',
  params: {
    snapId,
    request: {
      method: 'keyring_createAccount',
      params: {
        scope: 'xrpl:pubnet', // CAIP-2 chain ID
      },
    },
  },
});
```

## Contributing

This package is part of the Internal Snaps monorepo. See the [contribution processes](../../docs/processes/) for development, testing, building, and release instructions.
