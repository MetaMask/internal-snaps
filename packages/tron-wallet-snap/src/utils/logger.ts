import { Logger, LogLevel } from '@metamask/snap-networks-utils';

import { ConfigProvider } from '../services/config';

export const configProvider = new ConfigProvider();

const logger = new Logger({ level: configProvider.get().logLevel });

export const noOpLogger = new Logger({ level: LogLevel.SILENT });

export default logger;
