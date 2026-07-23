import { MethodNotFoundError } from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';

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
        throw new MethodNotFoundError() as Error;
    }
  }
}
