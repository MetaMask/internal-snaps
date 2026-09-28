# `@metamask/snap-networks-utils`

Shared utilities for MetaMask network snaps.

## Installation

`yarn add @metamask/snap-networks-utils`

or

`npm install @metamask/snap-networks-utils`

Within this monorepo, depend on the workspace package:

```bash
yarn workspace @metamask/tron-wallet-snap add @metamask/snap-networks-utils@workspace:^
```

## Usage

### Core AssetsController reads

Wire the Snap messenger endowment, then pass it to `AssetsProvider`:

```typescript
import type { Messenger } from '@metamask/messenger';
import { getMessenger } from '@metamask/snaps-sdk';
import type {
  AssetsControllerGetAccountAssetByIDAction,
  AssetsControllerGetAccountAssetsByIDsAction,
  AssetsControllerGetAccountAssetsByScopeAction,
} from '@metamask/assets-controller';
import { AssetsProvider } from '@metamask/snap-networks-utils';
import type { AccountId, Caip19AssetId } from '@metamask/assets-controller';

type CoreMessengerActions =
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction;

const messenger = getMessenger<Messenger<string, CoreMessengerActions>>();
const assetsProvider = new AssetsProvider({ messenger });

const accountId: AccountId = '550e8400-e29b-41d4-a716-446655440000';
const assetId: Caip19AssetId = 'tron:728126428/slip44:195';

const asset = await assetsProvider.getAccountAssetByID(accountId, assetId);
```

### Uncached Core AssetsController reads

`getAssets` is the only read that can reach out to the host's data sources. Pass
`bypassServerCache: true` to get the most up-to-date data, for example when a
Snap needs a freshly fetched asset and its metadata:

```typescript
const assets = await assetsProvider.getAssets(accounts, {
  chainIds: ['tron:728126428'],
  assetTypes: ['fungible'],
  bypassServerCache: true,
});
```

`bypassServerCache` implies `forceUpdate: true`, because the host only treats
the option as meaningful alongside a forced update. All other options are
forwarded to the host's `AssetsController:getAssets` as-is.

Requires `@metamask/assets-controller` 17.0.0 or later on the host. On older
hosts the option is ignored and the read falls back to the usual client-side
cache behavior.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/internal-snaps#readme).
