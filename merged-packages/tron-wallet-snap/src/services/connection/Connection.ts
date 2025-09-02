import { assert } from '@metamask/superstruct';

import type { Network } from '../../constants';
import { NetworkStruct } from '../../validation/structs';
import type { ConfigProvider, NetworkConfig } from '../config';

/**
 * Simplified connection service that can be extended if needed
 * Most functionality has been moved to specialized HTTP clients
 */
export class Connection {
  readonly #configProvider: ConfigProvider;

  constructor(configProvider: ConfigProvider) {
    this.#configProvider = configProvider;
  }

  /**
   * Get network configuration for a specific network
   *
   * @param network - The network to get configuration for
   * @returns Network configuration
   */
  getNetworkConfig(network: Network): NetworkConfig {
    assert(network, NetworkStruct);
    return this.#configProvider.getNetworkBy('caip2Id', network);
  }

  /**
   * Get RPC URLs for a specific network
   *
   * @param network - The network to get RPC URLs for
   * @returns Array of RPC URLs
   */
  getRpcUrls(network: Network): string[] {
    const config = this.getNetworkConfig(network);
    return config.rpcUrls;
  }

  /**
   * Get the primary RPC URL for a specific network
   *
   * @param network - The network to get the primary RPC URL for
   * @returns Primary RPC URL or empty string if none available
   */
  getPrimaryRpcUrl(network: Network): string {
    const rpcUrls = this.getRpcUrls(network);
    return rpcUrls[0] ?? '';
  }
}
