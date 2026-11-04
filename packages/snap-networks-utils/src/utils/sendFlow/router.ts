import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import { InvalidParamsError, MethodNotFoundError } from '@metamask/snaps-sdk';
import { assert, create } from '@metamask/superstruct';

import type { SendFlowStructs } from './structs';
import {
  SendFlowGetMaxSendableAmountResponseStruct,
  SendFlowValidationResponseStruct,
} from './structs';
import type { SendFlowHandlers, SendFlowValidationResponse } from './types';
import { SendFlowMethod } from './types';

const STRUCT_BY_METHOD: Record<SendFlowMethod, keyof SendFlowStructs> = {
  [SendFlowMethod.OnAddressInput]: 'OnAddressInputParams',
  [SendFlowMethod.OnAmountInput]: 'OnAmountInputParams',
  [SendFlowMethod.GetMaxSendableAmount]: 'GetMaxSendableAmountParams',
  [SendFlowMethod.ConfirmSend]: 'ConfirmSendParams',
  [SendFlowMethod.ComputeFee]: 'ComputeFeeParams',
};

const SEND_FLOW_METHODS = new Set<string>(Object.values(SendFlowMethod));

function createDefaultInvalidParamsError(error: unknown): Error {
  const errorToThrow = new InvalidParamsError() as Error;
  errorToThrow.cause = error;
  return errorToThrow;
}

type SendFlowResponseProcessor = (response: Json) => Json;

const PROCESS_RESPONSE_BY_METHOD: Record<
  SendFlowMethod,
  SendFlowResponseProcessor
> = {
  [SendFlowMethod.OnAddressInput]: validateValidationResponse,
  [SendFlowMethod.OnAmountInput]: validateValidationResponse,
  [SendFlowMethod.GetMaxSendableAmount]: (response) => {
    assert(response, SendFlowGetMaxSendableAmountResponseStruct);
    return response;
  },
  [SendFlowMethod.ConfirmSend]: (response) => response ?? null,
  [SendFlowMethod.ComputeFee]: (response) => response ?? null,
};

/**
 * Checks whether a JSON-RPC method belongs to the unified send flow.
 *
 * @param method - The JSON-RPC method.
 * @returns Whether the method is a unified send flow method.
 */
export function isSendFlowMethod(method: string): method is SendFlowMethod {
  return SEND_FLOW_METHODS.has(method);
}

function validateValidationResponse(
  response: Json,
): SendFlowValidationResponse {
  assert(response, SendFlowValidationResponseStruct);

  return response;
}

/**
 * Routes unified send flow JSON-RPC requests to the chain-specific handlers.
 *
 * The router owns the shared method dispatch, request validation, and response
 * validation. Each snap supplies only the methods it supports through
 * {@link SendFlowHandlers}.
 */
export class SendFlowRequestRouter {
  readonly #structs: SendFlowStructs;

  readonly #handlers: SendFlowHandlers;

  readonly #createInvalidParamsError: (error: unknown) => Error;

  constructor({
    structs,
    handlers,
    createInvalidParamsError = createDefaultInvalidParamsError,
  }: {
    structs: SendFlowStructs;
    handlers: SendFlowHandlers;
    /**
     * Converts a request validation error into the error thrown to the caller.
     * Snaps that surface the raw validation error (for example, Bitcoin) can
     * rethrow it instead of wrapping it in `InvalidParamsError`.
     */
    createInvalidParamsError?: (error: unknown) => Error;
  }) {
    this.#structs = structs;
    this.#handlers = handlers;
    this.#createInvalidParamsError = createInvalidParamsError;
  }

  /**
   * Handles a unified send flow request.
   *
   * @param request - The JSON-RPC request.
   * @returns The response, or `undefined` when the method is not part of the
   * unified send flow.
   * @throws {MethodNotFoundError} If the method is a unified send flow method
   * that the snap does not implement.
   * @throws {InvalidParamsError} If the request params are invalid.
   */
  async handle(request: JsonRpcRequest): Promise<Json | undefined> {
    if (!isSendFlowMethod(request.method)) {
      return undefined;
    }

    const { method } = request;
    const handler = this.#handlers[method];
    if (!handler) {
      throw new MethodNotFoundError() as Error;
    }

    const params = this.#validateParams(method, request.params);
    const response = await (
      handler as (params: unknown, request: JsonRpcRequest) => Promise<Json>
    )(params, request);

    return PROCESS_RESPONSE_BY_METHOD[method](response);
  }

  #validateParams(method: SendFlowMethod, params: unknown): unknown {
    try {
      return create(params, this.#structs[STRUCT_BY_METHOD[method]]);
    } catch (error) {
      throw this.#createInvalidParamsError(error);
    }
  }
}
