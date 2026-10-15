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

### Retrying calls to an upstream service

Create one `createFetchPolicy` per upstream service, convert errors to the `FetchPolicyError` shape at the network boundary, and wrap each call with `policy.execute()`:

```typescript
import {
  createFetchPolicy,
  createFetchPolicyError,
} from '@metamask/snap-networks-utils';

const priceApiPolicy = createFetchPolicy({ service: 'price_api', logger });

const prices = await priceApiPolicy.execute(async () => {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw createFetchPolicyError(`HTTP ${response.status}`, {
      httpStatus: response.status,
    });
  }
  return response.json();
});
```

Don't wrap calls that build, sign and send a transaction: a retry could send it twice.

While the circuit is open, `policy.execute()` throws `BrokenCircuitError` without calling the service. Its `name` is `Error`, so check for it with `instanceof`.

The policy's underlying library times calls with `performance.now()`, which snaps don't have. Add `webpack` as a dev dependency, on the same major version that `@metamask/snaps-cli` uses (currently 5), and provide the shim in `snap.config.ts`:

```typescript
import type { SnapConfig } from '@metamask/snaps-cli';
import { merge } from '@metamask/snaps-cli';
import { ProvidePlugin } from 'webpack';

const config: SnapConfig = {
  // ...
  customizeWebpackConfig: (webpackConfig) =>
    merge(webpackConfig, {
      plugins: [
        new ProvidePlugin({
          performance: '@metamask/snap-networks-utils/performance-shim',
        }),
      ],
    }),
};
```

### Images

UI components may import `.svg` files as strings, like in a Snap. The files are copied to `dist/` as-is, so consumers must bundle the package with `mm-snap` (or another bundler that loads `.svg` files as source).

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/internal-snaps#readme).
