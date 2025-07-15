import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';

import { validateOrigin } from '../validation/validators';

export class RpcHandler {
  async handle(
    origin: string,
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    validateOrigin(origin, request.method);

    return {
      id: request.id,
      jsonrpc: request.jsonrpc,
      result: null,
    };
  }
}
