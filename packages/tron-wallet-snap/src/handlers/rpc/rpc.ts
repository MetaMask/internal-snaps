import { validateOrigin } from '@metamask/snap-networks-utils';
import type { Logger } from '@metamask/snap-networks-utils';
import { MethodNotFoundError } from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';

import { originPermissions } from '../../permissions';

export class RpcHandler {
  readonly #logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.#logger = logger.withPrefix('[👋 RpcHandler]');
  }

  async handle(origin: string, request: JsonRpcRequest): Promise<Json> {
    validateOrigin(origin, request.method, originPermissions);

    this.#logger.log('Handling RPC request', request);

    const { method } = request;

    switch (method) {
      default:
        throw new MethodNotFoundError() as Error;
    }
  }
}
