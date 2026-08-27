import { Logger, LogLevel } from '@metamask/snap-networks-utils';

import { AppConfig } from '../config';

export const logger = new Logger({ level: AppConfig.logLevel });

export const noOpLogger = new Logger({ level: LogLevel.SILENT });
