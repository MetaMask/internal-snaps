import { TronWeb } from 'tronweb';

import type { Network } from '../../constants';
import type { ConfigProvider } from '../../services/config';

export class TronWebFactory {
  readonly #configProvider: ConfigProvider;

  constructor({ configProvider }: { configProvider: ConfigProvider }) {
    this.#configProvider = configProvider;
  }

  /**
   * Create a TronWeb client instance for a specific network
   * This creates a fresh instance each time, avoiding state management issues
   *
   * @param network - The network to create the client for
   * @param privateKey - Optional private key to configure the client with
   * @returns TronWeb instance configured for the specified network
   *
   * @example
   * // With private key for signing transactions
   * const tronWeb = factory.createClient(Network.Mainnet, privateKey);
   * const transaction = await tronWeb.transactionBuilder.sendTrx(to, amount);
   * const signedTx = await tronWeb.trx.sign(transaction);
   *
   * // Without private key for read-only operations
   * const tronWeb = factory.createClient(Network.Mainnet);
   * const balance = await tronWeb.trx.getBalance(address);
   */
  createClient(network: Network, privateKey?: string): TronWeb {
    const config = this.#configProvider.get();
    const { baseUrls } = config.trongridApi;

    const fullHost = baseUrls[network];
    if (!fullHost) {
      throw new Error(`No configuration found for network: ${network}`);
    }

    const tronWebConfig = {
      fullHost,
      ...(privateKey && { privateKey }),
    };

    return new TronWeb(tronWebConfig);
  }
}
