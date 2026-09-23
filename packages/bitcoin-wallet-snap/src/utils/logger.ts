import { Logger } from '@metamask/snap-networks-utils';

import { configProvider } from '../config';

const logger = new Logger({ level: configProvider.config.logLevel });

export default logger;
