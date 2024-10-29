# @metamask/solana-wallet-snap

This snap represents the Solana wallet for MetaMask.

## Running the snap locally

```bash
yarn workspace @metamask/solana-wallet-snap start
```

> [!WARNING]  
> When snap updates you will need to still reconnect from the dapp to see changes

> [!TIP]
> Alternatively you can build and serve the snap manually. This can sometimes be more stable than watch mode but requires a manual rebuild and serve anytime there is a change on the snap.

## Building and serving snap manually

```bash
yarn workspace @metamask/solana-wallet-snap build
yarn workspace @metamask/solana-wallet-snap serve
```

Further reading:

- [Development](../../docs/development.md)
- [Contributing](../../docs/contributing.md)
- [Testing](../../docs/testing.md)
- [Releasing](../../docs/release.md)
