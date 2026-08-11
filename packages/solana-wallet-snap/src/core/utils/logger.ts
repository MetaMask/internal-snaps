import { Logger, LogLevel } from '@metamask/snap-networks-utils/logger';

import { ConfigProvider } from '../services/config';
import { logMaybeSolanaError } from './logMaybeSolanaError';

const configProvider = new ConfigProvider();

const logger = new Logger({
  level: configProvider.get().logLevel,
  decorators: {
    error: (next, error, ...args): void => {
      logMaybeSolanaError(error, next);
      next(error, ...args);
    },
  },
});

export const noOpLogger = new Logger({ level: LogLevel.SILENT });

export default logger;
