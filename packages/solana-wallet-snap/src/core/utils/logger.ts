import { Logger, LogLevel } from '@metamask/snap-networks-utils';

import { configProvider } from '../services/config';
import { logMaybeSolanaError } from './logMaybeSolanaError';

const { logLevel } = configProvider.get();

const logger = new Logger({
  level: logLevel,
  decorators: {
    error: (next, error, ...args): void => {
      logMaybeSolanaError(error, next);
      next(error, ...args);
    },
  },
});

export const noOpLogger = new Logger({ level: LogLevel.SILENT });

export default logger;
