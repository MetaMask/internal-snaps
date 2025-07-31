import { assert } from '@metamask/superstruct';
import { TronWeb, providers } from 'tronweb';

import type { Network } from '../../constants';
import { NetworkStruct } from '../../validation/structs';
import type { ConfigProvider } from '../config';

export class Connection {
  readonly #networkCaip2IdToConnection: Map<Network, TronWeb> = new Map();

  readonly #configProvider: ConfigProvider;

  constructor(configProvider: ConfigProvider) {
    this.#configProvider = configProvider;
  }

  #createConnection(network: Network): TronWeb {
    const config = this.#configProvider.getNetworkBy('caip2Id', network);
    const rpcUrl = config.rpcUrls[0] ?? '';
    const fullNode = new providers.HttpProvider(rpcUrl);
    const solidityNode = new providers.HttpProvider(rpcUrl);
    const eventServer = new providers.HttpProvider(rpcUrl);

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Origin': '*',
      'TRON-PRO-API-KEY': this.#configProvider.get().tronApi.apiKey,
    };

    const connection = new TronWeb({
      fullNode,
      solidityNode,
      eventServer,
    });

    connection.setHeader(headers);

    this.#networkCaip2IdToConnection.set(network, connection);

    return connection;
  }

  getConnection(network: Network): TronWeb {
    assert(network, NetworkStruct);
    return (
      this.#networkCaip2IdToConnection.get(network) ??
      this.#createConnection(network)
    );
  }
}
