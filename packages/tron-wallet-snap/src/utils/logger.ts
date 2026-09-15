import { Logger, LogLevel } from '@metamask/snap-networks-utils';

import { configProvider } from '../services/config';

const { logLevel } = configProvider.get();

const logger = new Logger({ level: logLevel });

export const noOpLogger = new Logger({ level: LogLevel.SILENT });

export default logger;
