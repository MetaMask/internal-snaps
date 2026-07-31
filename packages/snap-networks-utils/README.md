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

### AssetsController reads

```typescript
import { AssetsService } from '@metamask/snap-networks-utils';

const assetsService = new AssetsService({ coreMessenger });
const asset = await assetsService.getAccountAssetByID(accountId, assetId);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/internal-snaps#readme).
