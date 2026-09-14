import type { Logger } from '@metamask/snap-networks-utils';
import { getPrimaryDomain, resolve } from '@solana-name-service/sns-sdk-kit';
import type { Address } from '@solana/kit';
import { address as asAddress } from '@solana/kit';

import type { Network } from '../../constants/solana';
import type { SolanaConnection } from '../connection/SolanaConnection';

export class NameResolutionService {
  readonly #connection: SolanaConnection;

  readonly #logger: Logger;

  tld = '.sns';

  constructor(connection: SolanaConnection, logger: Logger) {
    this.#connection = connection;
    this.#logger = logger;
  }

  async resolveDomain(scope: Network, domain: string): Promise<Address> {
    const connection = this.#connection.getRpc(scope);
    return resolve({ rpc: connection, domain });
  }

  async resolveAddress(
    scope: Network,
    address: string,
  ): Promise<string | null> {
    try {
      const connection = this.#connection.getRpc(scope);
      const primaryDomain = await getPrimaryDomain({
        rpc: connection,
        walletAddress: asAddress(address),
      });

      return `${primaryDomain.domainName}${this.tld}`;
    } catch (error) {
      this.#logger.error('Error resolving address', error);
      return null;
    }
  }
}
