import type { Logger } from '@metamask/snap-networks-utils';
import {
  createFetchPolicy,
  fetchWithPolicy,
} from '@metamask/snap-networks-utils';
/* eslint-disable no-restricted-globals */
import bs58 from 'bs58';

import { Network } from '../../constants/solana';
import type { ConfigProvider } from '../../services/config';
import logger from '../../utils/logger';
import type { SecurityAlertSimulationValidationResponse } from './types';

const SCOPE_TO_CHAIN: Record<Network, string> = {
  [Network.Mainnet]: 'mainnet',
  [Network.Devnet]: 'devnet',
  [Network.Testnet]: 'testnet',
  [Network.Localnet]: 'localnet',
};

export class SecurityAlertsApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #logger: Logger;

  readonly #baseUrl: string;

  readonly #policy: ReturnType<typeof createFetchPolicy>;

  constructor(
    configProvider: ConfigProvider,
    _fetch: typeof globalThis.fetch = globalThis.fetch,
    _logger: Logger = logger,
  ) {
    const { baseUrl } = configProvider.config.securityAlertsApi;

    this.#fetch = _fetch;
    this.#logger = _logger;
    this.#baseUrl = baseUrl;
    this.#policy = createFetchPolicy({
      service: 'security_alerts_api',
      logger: this.#logger,
    });
  }

  async scanTransactions({
    method,
    accountAddress,
    transactions,
    scope,
    origin,
    options,
  }: {
    method: string;
    accountAddress: string;
    transactions: string[];
    scope: Network;
    origin: string;
    options: string[];
  }): Promise<SecurityAlertSimulationValidationResponse> {
    const base64AccountAddress = Buffer.from(
      bs58.decode(accountAddress),
    ).toString('base64');

    this.#logger.info('Scanning transaction');

    const body = await fetchWithPolicy(
      this.#policy,
      `${this.#baseUrl}/solana/message/scan`,
      {
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({
          method,
          encoding: 'base64',
          account_address: base64AccountAddress,
          metadata: {
            url: origin,
          },
          chain: SCOPE_TO_CHAIN[scope],
          transactions,
          options,
        }),
      },
      this.#fetch,
    );

    return JSON.parse(body);
  }
}
