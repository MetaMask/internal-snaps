import type { Logger } from '@metamask/snap-networks-utils/logger';
import { MethodNotFoundError } from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';

import { validateOrigin } from '../../validation/validators';

export class RpcHandler {
  readonly #logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.#logger = logger.withPrefix('[👋 RpcHandler]');
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
