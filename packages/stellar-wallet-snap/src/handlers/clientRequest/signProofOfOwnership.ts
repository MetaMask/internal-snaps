import type { Logger } from '@metamask/snap-networks-utils';
import { InvalidParamsError } from '@metamask/snaps-sdk';
import { add0x } from '@metamask/utils';

import type { AccountResolver } from '../accountResolver';
import { RESOLVE_ACCOUNT_KEYRING_AND_WALLET } from '../accountResolver';
import { BaseHandler } from '../base';
import type {
  SignProofOfOwnershipJsonRpcRequest,
  SignProofOfOwnershipJsonRpcResponse,
} from './api';
import {
  SignProofOfOwnershipJsonRpcRequestStruct,
  SignProofOfOwnershipJsonRpcResponseStruct,
} from './api';
import type { IClientRequestHandler } from './base';

/**
 * Handles the silent signing of a proof-of-ownership message, of format
 * `'metamask:proof-of-ownership:{nonce}:{address}'`.
 *
 * Used by `@metamask/profile-metrics-controller` to prove wallet control of an
 * address. This is a **silent sign** (no user confirmation dialog): it skips
 * the usual sign-message security prompt on purpose so the client can collect
 * profile-metrics ownership proofs without interrupting the user.
 *
 */
export class SignProofOfOwnershipHandler
  // We don't need to resolve an on-chain account for this handler,
  // so we can use the base handler without any additional options.
  extends BaseHandler<
    SignProofOfOwnershipJsonRpcRequest,
    SignProofOfOwnershipJsonRpcResponse
  >
  implements IClientRequestHandler
{
  readonly #accountResolver: AccountResolver;

  constructor({
    logger,
    accountResolver,
  }: {
    logger: Logger;
    accountResolver: AccountResolver;
  }) {
    super({
      logger: logger.withPrefix('[🔏 SignProofOfOwnershipHandler]'),
      requestStruct: SignProofOfOwnershipJsonRpcRequestStruct,
      responseStruct: SignProofOfOwnershipJsonRpcResponseStruct,
    });
    this.#accountResolver = accountResolver;
  }

  /**
   * Resolves the keyring account + wallet (no on-chain activation required)
   * and signs the validated proof message.
   *
   * @param request - The JSON-RPC request containing `accountId`, `message`,
   * and coerced `address`.
   * @returns `{ signature }` — SEP-0053 64-byte ed25519 signature as hex
   * (128 chars) with a leading `0x` (prefix not included in the 64 bytes).
   * @throws {InvalidParamsError} If the address in the message does not match
   * the signing account.
   */
  protected async handleRequest(
    request: SignProofOfOwnershipJsonRpcRequest,
  ): Promise<SignProofOfOwnershipJsonRpcResponse> {
    const { accountId, message, address: messageAddress } = request.params;

    const { account, wallet } = await this.#accountResolver.resolveAccount({
      accountId,
      options: RESOLVE_ACCOUNT_KEYRING_AND_WALLET,
    });

    if (messageAddress !== account.address) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- InvalidParamsError is the JSON-RPC snap error surface
      throw new InvalidParamsError(
        `Address in proof-of-ownership message (${messageAddress}) does not match signing account address (${account.address})`,
      );
    }

    return {
      signature: add0x(wallet.signMessage(message, 'hex')),
    };
  }
}
