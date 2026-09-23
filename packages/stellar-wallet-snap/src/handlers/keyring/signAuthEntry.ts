import type { Logger } from '@metamask/snap-networks-utils';
import { UserRejectedRequestError } from '@metamask/snaps-sdk';
import { xdr } from '@stellar/stellar-sdk';

import type { StellarKeyringAccount } from '../../services/account';
import type { ReadableAuthorizationJson } from '../../services/transaction';
import { AuthorizationMapper } from '../../services/transaction';
import type { Wallet } from '../../services/wallet';
import { ConfirmationInterfaceKey } from '../../ui/confirmation/api';
import type { ConfirmationUXController } from '../../ui/confirmation/controller';
import {
  isSorobanAuthPreimageV1,
  isSorobanAuthPreimageV2,
  getAddress,
} from '../../utils/xdr';
import type { AccountResolver } from '../accountResolver';
import type { SignAuthEntryRequest, SignAuthEntryResponse } from './api';
import { SignAuthEntryRequestStruct, SignAuthEntryResponseStruct } from './api';
import { BaseSep43KeyringHandler } from './base';
import { Sep43Error, Sep43ErrorCode } from './exceptions';

/**
 * Human-readable Soroban auth entry summary rendered in the confirmation
 * dialog. Invocation details come from {@link AuthorizationMapper}; nonce and
 * expiry are preimage-only fields.
 */
export type ReadableAuthEntry = {
  /** Flat list: root invocation first, then depth-first sub-invocations. */
  authorizations: ReadableAuthorizationJson[];
  /** Ledger sequence at which this authorization expires (exclusive). */
  signatureExpirationLedger: number;
  /** Replay-protection nonce. */
  nonce: string;
};

/**
 * SEP-43 `signAuthEntry` keyring handler.
 *
 * The dapp passes a base64-encoded `HashIdPreimage` (v1
 * `envelopeTypeSorobanAuthorization` or CAP-71 v2
 * `envelopeTypeSorobanAuthorizationWithAddress`). The handler decodes it for
 * display in the confirmation dialog and, on confirm, asks the wallet to
 * `sha256(preimage) → ed25519 sign`. The network passphrase is already
 * baked into the preimage's `networkId`, so no additional prefix is applied.
 * A v2 bound address that does not match the signing account is rejected.
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md
 */
export class SignAuthEntryHandler extends BaseSep43KeyringHandler<
  SignAuthEntryRequest,
  SignAuthEntryResponse
> {
  readonly #confirmationUIController: ConfirmationUXController;

  constructor({
    logger,
    accountResolver,
    confirmationUIController,
  }: {
    logger: Logger;
    accountResolver: AccountResolver;
    confirmationUIController: ConfirmationUXController;
  }) {
    super({
      logger,
      accountResolver,
      loggerPrefix: '[🛂 SignAuthEntryHandler]',
      requestStruct: SignAuthEntryRequestStruct,
      responseStruct: SignAuthEntryResponseStruct,
    });
    this.#confirmationUIController = confirmationUIController;
  }

  protected async execute(
    request: SignAuthEntryRequest,
    resolved: { account: StellarKeyringAccount; wallet: Wallet },
  ): Promise<SignAuthEntryResponse> {
    const { account, wallet } = resolved;
    const { authEntry } = request.request.params;

    const { readableAuthEntry, boundAddress } =
      this.#decodeSorobanAuthPreimage(authEntry);

    this.#assertIsValidBoundAddress(boundAddress, account.address);

    if (!(await this.#confirm(request, account, readableAuthEntry))) {
      throw new UserRejectedRequestError() as unknown as Error;
    }

    const signedAuthEntry = wallet.signAuthEntry(authEntry);

    return {
      signedAuthEntry,
      signerAddress: account.address,
    };
  }

  protected toErrorResponse(
    signerAddress: string,
    error: Sep43Error,
  ): SignAuthEntryResponse {
    return {
      // SEP-43 schema requires the field even on error; keep it empty when unknown.
      signedAuthEntry: '',
      signerAddress,
      error: error.toJSON(),
    };
  }

  async #confirm(
    request: SignAuthEntryRequest,
    account: StellarKeyringAccount,
    readableAuthEntry: ReadableAuthEntry,
  ): Promise<boolean> {
    return (
      (await this.#confirmationUIController.renderConfirmationDialog({
        scope: request.scope,
        renderContext: {
          account,
          readableAuthEntry,
        },
        origin: request.origin,
        interfaceKey: ConfirmationInterfaceKey.SignAuthEntry,
      })) === true
    );
  }

  /**
   * Decodes a SEP-43 `signAuthEntry` payload into the user-facing summary.
   * The struct has already validated a v1 or CAP-71 v2 Soroban authorization
   * preimage, so other `HashIdPreimage` arms are not expected.
   *
   * @param authEntry - Base64-encoded `HashIdPreimage` XDR.
   * @returns Fields displayed in the confirmation dialog, plus the CAP-71
   * bound address when present.
   */
  #decodeSorobanAuthPreimage(authEntry: string): {
    readableAuthEntry: ReadableAuthEntry;
    boundAddress: string | null;
  } {
    const preimage = xdr.HashIdPreimage.fromXdr(authEntry, 'base64');

    if (isSorobanAuthPreimageV1(preimage)) {
      const { invocation, signatureExpirationLedger, nonce } =
        preimage.sorobanAuthorization;
      return {
        readableAuthEntry: {
          authorizations: new AuthorizationMapper().mapInvocation(invocation),
          signatureExpirationLedger,
          nonce: nonce.toString(),
        },
        boundAddress: null,
      };
    }

    if (isSorobanAuthPreimageV2(preimage)) {
      const { invocation, signatureExpirationLedger, nonce, address } =
        preimage.sorobanAuthorizationWithAddress;
      const boundAddress = getAddress(address);
      return {
        readableAuthEntry: {
          authorizations: new AuthorizationMapper().mapInvocation(
            invocation,
            boundAddress,
          ),
          signatureExpirationLedger,
          nonce: nonce.toString(),
        },
        boundAddress,
      };
    }

    // Safe guard: 
    // The request struct already accepted only v1/v2 Soroban auth preimages.
    throw new Sep43Error({
      code: Sep43ErrorCode.InvalidRequest,
      message: 'HashIdPreimage is not a Soroban authorization preimage',
    });
  }

  #assertIsValidBoundAddress(
    boundAddress: string | null,
    accountAddress: string,
  ): void {
    if (boundAddress === null || boundAddress === accountAddress) {
      return;
    }
    throw new Sep43Error({
      code: Sep43ErrorCode.InvalidRequest,
      message: 'Authorization bound address does not match the signing account',
    });
  }
}
