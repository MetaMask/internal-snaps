import type { Json, JsonRpcRequest } from '@metamask/utils';

import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';
import { validateOrigin } from '../../validation/validators';

export class RpcHandler {
  readonly #logger: ILogger;

  constructor({ logger }: { logger: ILogger }) {
    this.#logger = createPrefixedLogger(logger, '[👋 RpcHandler]');
  }

  async handle(origin: string, request: JsonRpcRequest): Promise<Json> {
    validateOrigin(origin, request.method);

    this.#logger.log('Handling RPC request', request);

    const { method } = request;

    switch (method) {
      default:
        return {
          id: request.id,
          jsonrpc: request.jsonrpc,
          result: null,
        };
    }
  }
}
