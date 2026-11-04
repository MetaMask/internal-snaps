import { SendFlowRequestRouter } from '@metamask/snap-networks-utils';
import { MethodNotFoundError } from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import { ensureError } from '@metamask/utils';

import {
  ClientRequestMethod,
  ClientRequestMethodStruct,
  stellarSendFlowStructs,
} from './api';
import type { IClientRequestHandler } from './base';

export class ClientRequestHandler {
  readonly #handlers: Record<ClientRequestMethod, IClientRequestHandler>;

  readonly #sendFlowRouter: SendFlowRequestRouter;

  constructor({
    handlers,
  }: {
    handlers: Record<ClientRequestMethod, IClientRequestHandler>;
  }) {
    this.#handlers = handlers;
    this.#sendFlowRouter = new SendFlowRequestRouter({
      structs: stellarSendFlowStructs,
      handlers: {
        onAddressInput: async (_params, request): Promise<Json> =>
          this.#handlers[ClientRequestMethod.OnAddressInput].handle(request),
        onAmountInput: async (_params, request): Promise<Json> =>
          this.#handlers[ClientRequestMethod.OnAmountInput].handle(request),
        confirmSend: async (_params, request): Promise<Json> =>
          this.#handlers[ClientRequestMethod.ConfirmSend].handle(request),
        computeFee: async (_params, request): Promise<Json> =>
          this.#handlers[ClientRequestMethod.ComputeFee].handle(request),
      },
    });
  }

  /**
   * Handles JSON-RPC requests originating exclusively from the client - as defined in [SIP-31](https://github.com/MetaMask/SIPs/blob/main/SIPS/sip-31.md) -
   * by routing them to the appropriate use case, based on the method. Some methods need to be implemented
   * as part of the [Unified Non-EVM Send](https://www.notion.so/metamask-consensys/Unified-Non-EVM-Send-248f86d67d6880278445f9ad75478471) specification.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   * @throws {MethodNotFoundError} If the method is not found.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async handle(request: JsonRpcRequest): Promise<Json> {
    const sendFlowResponse = await this.#sendFlowRouter.handle(request);
    if (sendFlowResponse !== undefined) {
      return sendFlowResponse;
    }

    return (await this.#handleClientRequest(request)) ?? null;
  }

  /**
   * Handles a client request by routing it to the appropriate use case, based on the method.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   */
  async #handleClientRequest(request: JsonRpcRequest): Promise<Json> {
    const { method } = request;

    const [validateError, validatedMethod] =
      ClientRequestMethodStruct.validate(method);
    if (validateError !== undefined) {
      throw ensureError(new MethodNotFoundError());
    }

    const handler = this.#handlers[validatedMethod];

    return handler.handle(request);
  }
}
