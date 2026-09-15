import { Logger } from '@metamask/snap-networks-utils';

import { configProvider } from '../config';

const { logLevel } = configProvider.get();

const logger = new Logger({ level: logLevel });

export default logger;
