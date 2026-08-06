# Logger

`Logger` is a configurable console logger for MetaMask network snaps.

## Usage

```typescript
import { Logger } from '@metamask/snap-networks-utils/logger';

const logger = new Logger({ enabled: true });
```

## Configuration

### `enabled` (required)

`enabled` controls whether the logger writes messages to the console. Set it to
`false` when logging should be disabled, such as in production.

```typescript
const logger = new Logger({
  enabled: process.env.ENVIRONMENT !== 'production',
});
```

A disabled `Logger` is the no-op logger; no separate `noOpLogger` export is
needed:

```typescript
const logger = new Logger({
  enabled: false,
});
```

### `level`

`level` selects the most verbose severity that is written. It defaults to
`LogLevel.TRACE`, so an enabled logger writes every supported level by default.
Set a lower level to reduce output.

```typescript
const logger = new Logger({
  enabled: true,
  level: LogLevel.INFO,
});
```

`log` is a deprecated compatibility alias for `info`; prefer `info` in new code.

### `prefix`

Set a prefix when constructing a logger, or use `withPrefix` later during setup
to create a logger for a Snap or component. A derived logger retains the parent
logger's configuration and adds its prefix to the existing prefix.

```typescript
import { Logger } from '@metamask/snap-networks-utils/logger';

const logger = new Logger({
  enabled: true,
  prefix: '[tron-wallet-snap]',
});

logger.info('Account synced');
```

Call `withPrefix` as many times as needed. Assign each derived logger before
using it:

```typescript
const rootLogger = new Logger({ enabled: true });
const snapLogger = rootLogger.withPrefix('[tron-wallet-snap]');
const accountsLogger = snapLogger.withPrefix('[accounts]');

accountsLogger.debug('Refreshing account balances');
```

### `decorators`

Use a decorator to add Snap-specific behavior to one logging method. `next`
retains the logger's configured level, prefix, and console output.

```typescript
const logger = new Logger({
  enabled: true,
  decorators: {
    error: (next, error) => {
      const details = getSolanaErrorDetails(error);
      next(details ? ...details : error);
    },
  },
});
```
