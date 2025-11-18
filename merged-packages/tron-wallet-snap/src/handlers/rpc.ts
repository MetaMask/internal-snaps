import type { Json, JsonRpcRequest } from '@metamask/utils';

import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';
import { validateOrigin } from '../validation/validators';
import type { ClientRequestHandler } from './clientRequest/clientRequest';
import { ClientRequestMethod } from './clientRequest/types';
import { TestDappRpcRequestMethod } from './rpc/types';

export class RpcHandler {
  readonly #logger: ILogger;

  readonly #clientRequestHandler: ClientRequestHandler;

  constructor({
    logger,
    clientRequestHandler,
  }: {
    logger: ILogger;
    clientRequestHandler: ClientRequestHandler;
  }) {
    this.#logger = createPrefixedLogger(logger, '[👋 ClientRequestHandler]');
    this.#clientRequestHandler = clientRequestHandler;
  }

  async handle(origin: string, request: JsonRpcRequest): Promise<Json> {
    validateOrigin(origin, request.method);

    this.#logger.log('Handling client request', request);

    const { method } = request;

    switch (method) {
      /**
       * Wallet Standard
       */
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case ClientRequestMethod.SignAndSendTransaction:
        return this.#clientRequestHandler.handle(request);

      /**
       * Test dapp specific methods
       */
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      case TestDappRpcRequestMethod.ComputeFee:
        return this.#clientRequestHandler.handle({
          ...request,
          method: ClientRequestMethod.ComputeFee,
        });

      default:
        return {
          id: request.id,
          jsonrpc: request.jsonrpc,
          result: null,
        };
    }
  }
}
