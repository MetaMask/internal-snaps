import {
  getJsonError,
  InvalidParamsError,
  SnapError,
} from '@metamask/snaps-sdk';
import type { Infer, Struct } from '@metamask/superstruct';
import { assert } from '@metamask/superstruct';

/**
 * Validates that the request parameters conform to the expected structure defined by the provided struct.
 *
 * @template Params - The expected structure of the request parameters.
 * @param requestParams - The request parameters to validate.
 * @param struct - The expected structure of the request parameters.
 * @throws {typeof InvalidParamsError} If the request parameters do not conform to the expected structure.
 */
export function validateRequest<Params, TStruct extends Struct<any>>(
  requestParams: Params,
  struct: TStruct,
): asserts requestParams is Infer<TStruct> {
  try {
    assert(requestParams, struct);
  } catch (error: any) {
    throw new InvalidParamsError(error.message) as unknown as Error;
  }
}

/**
 * Validates that the response conforms to the expected structure defined by the provided struct.
 *
 * @template Params - The expected structure of the response.
 * @param response - The response to validate.
 * @param struct - The expected structure of the response.
 * @throws {SnapError} If the response does not conform to the expected structure.
 */
export function validateResponse<Params, TStruct extends Struct<any>>(
  response: Params,
  struct: TStruct,
): asserts response is Infer<TStruct> {
  try {
    assert(response, struct);
  } catch (error) {
    throw new SnapError('Invalid Response', {
      data: { cause: getJsonError(error) },
    });
  }
}
