import { Logger, LogLevel } from '@metamask/snap-networks-utils';

import { mockLogger } from '../mockLogger';

export default mockLogger;

export const noOpLogger = new Logger({ level: LogLevel.SILENT });
