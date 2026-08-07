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

### Logger

```typescript
import { logger, createPrefixedLogger } from '@metamask/snap-networks-utils';
// or: import { logger } from '@metamask/snap-networks-utils/logger';

const snapLogger = createPrefixedLogger(logger, '[tron-wallet-snap]');
snapLogger.info('account synced');
```

### Core AssetsController reads

Wire the Snap messenger endowment, then pass it to `AssetsProvider`. Provider
messenger types are namespace-agnostic callers, so the Snap Core messenger (which
uses the Snap's own namespace and may expose additional actions) is assignable
without casts:

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

type CoreMessengerConstraint = Messenger<'ExampleSnap', CoreMessengerActions>;

const messenger = getMessenger<CoreMessengerConstraint>();
const assetsProvider = new AssetsProvider({ messenger });

const accountId: AccountId = '550e8400-e29b-41d4-a716-446655440000';
const assetId: Caip19AssetId = 'tron:728126428/slip44:195';

const asset = await assetsProvider.getAccountAssetByID(accountId, assetId);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/internal-snaps#readme).
