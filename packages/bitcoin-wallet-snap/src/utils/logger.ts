import { Logger } from '@metamask/snap-networks-utils';

import { Config } from '../config';

const logger = new Logger({ level: Config.logLevel });

export default logger;
