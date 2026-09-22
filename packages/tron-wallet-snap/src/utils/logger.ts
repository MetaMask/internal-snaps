import { Logger, LogLevel } from '@metamask/snap-networks-utils';

import { configProvider } from '../services/config';

const logger = new Logger({ level: configProvider.config.logLevel });

export const noOpLogger = new Logger({ level: LogLevel.SILENT });

export default logger;
