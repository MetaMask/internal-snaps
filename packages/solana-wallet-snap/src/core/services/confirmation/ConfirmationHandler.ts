import { SolMethod } from '@metamask/keyring-api';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import type { Json } from '@metamask/snaps-sdk';
import { assert, union } from '@metamask/superstruct';

import { render as renderConfirmSignIn } from '../../../features/confirmation/views/ConfirmSignIn/render';
import { render as renderConfirmSignMessage } from '../../../features/confirmation/views/ConfirmSignMessage/render';
import {
  DEFAULT_CONFIRMATION_CONTEXT,
  render as renderConfirmTransactionRequest,
} from '../../../features/confirmation/views/ConfirmTransactionRequest/render';
import type { ConfirmTransactionRequestResult } from '../../../features/confirmation/views/ConfirmTransactionRequest/types';
import { ScheduleBackgroundEventMethod } from '../../handlers/onCronjob/backgroundEvents/ScheduleBackgroundEventMethod';
import type { SolanaKeyringRequest } from '../../handlers/onKeyringRequest/structs';
import { resolveTransactionType } from '../../utils/transactionType';
import {
  SolanaSignAndSendTransactionRequestStruct,
  SolanaSignTransactionRequestStruct,
} from '../wallet/structs';

/**
 * The outcome of a keyring confirmation. `context` carries the security verdict
 * the user saw for a transaction, and is omitted for the other requests.
 */
type ConfirmationOutcome = {
  confirmed: boolean;
  context?: ConfirmTransactionRequestResult['context'];
};

/**
 * Wraps the confirmation logic for the keyring API.
 *
 * It is responsible for rendering the confirmation UI and handling the side effects that need to happen when the transaction is shown in confirmation UI.
 */
export class ConfirmationHandler {
  /**
   * Handles the confirmation of a request, based on the method of the request.
   * Renders the appropriate confirmation UI for the request, and returns the user's decision.
   *
   * @param request - The request to confirm.
   * @param account - The account that the request is for.
   * @returns The user's decision. For a transaction, it also carries the security verdict the user saw, when one is reported.
   */
  async handleKeyringRequest(
    request: SolanaKeyringRequest,
    account: ExtendedKeyringAccount,
  ): Promise<ConfirmationOutcome> {
    const {
      request: { method },
    } = request;

    switch (method) {
      case SolMethod.SignAndSendTransaction:
        return this.#handleConfirmTransactionRequest(request, account);
      case SolMethod.SignTransaction:
        return this.#handleConfirmTransactionRequest(request, account);
      case SolMethod.SignMessage:
        return this.#handleConfirmSignMessage(request, account);
      case SolMethod.SignIn:
        return this.#handleConfirmSignIn(request, account);
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  /**
   * Handles the confirmation whenever a transaction needs to be signed:
   * - Sign and send transaction request.
   * - Sign transaction request.
   *
   * @param request - The request to confirm.
   * @param account - The account that the request is for.
   * @returns The user's decision, carrying the security verdict the user saw when one is reported.
   */
  async #handleConfirmTransactionRequest(
    request: SolanaKeyringRequest,
    account: ExtendedKeyringAccount,
  ): Promise<ConfirmationOutcome> {
    assert(
      request.request,
      union([
        SolanaSignAndSendTransactionRequestStruct,
        SolanaSignTransactionRequestStruct,
      ]),
    );

    const {
      request: {
        method,
        params: { transaction: base64EncodedTransaction },
      },
      scope,
      account: accountId,
      origin,
    } = request;

    /**
     * Resolved once and carried by all three lifecycle events, so Added,
     * Approved and Rejected always agree on the classification.
     */
    const transactionType = resolveTransactionType({ origin });

    // Trigger the side effects that need to happen when the transaction is shown in confirmation UI
    await snap.request({
      method: 'snap_scheduleBackgroundEvent',
      params: {
        duration: 'PT1S',
        request: {
          method: ScheduleBackgroundEventMethod.OnTransactionAdded,
          params: {
            accountId,
            metadata: {
              scope,
              origin,
              transactionType,
            },
          },
        },
      },
    });

    const { confirmed, context } = await renderConfirmTransactionRequest({
      ...DEFAULT_CONFIRMATION_CONTEXT,
      scope,
      method,
      origin: request.origin,
      transaction: base64EncodedTransaction,
      account,
    });

    /**
     * The verdict the user saw, carried by the Approved and Rejected events
     * only. Added is dispatched before the user decides, so it has none.
     */
    const { securityProperties } = context;
    const securityMetadata: Record<string, Json> = securityProperties
      ? { securityProperties }
      : {};

    if (confirmed) {
      // Trigger the side effects that need to happen when the transaction is approved
      await snap.request({
        method: 'snap_scheduleBackgroundEvent',
        params: {
          duration: 'PT1S',
          request: {
            method: ScheduleBackgroundEventMethod.OnTransactionApproved,
            params: {
              accountId,
              metadata: {
                scope,
                origin,
                transactionType,
                ...securityMetadata,
              },
            },
          },
        },
      });

      return { confirmed: true, context };
    }

    // Trigger the side effects that need to happen when the transaction is rejected
    await snap.request({
      method: 'snap_scheduleBackgroundEvent',
      params: {
        duration: 'PT1S',
        request: {
          method: ScheduleBackgroundEventMethod.OnTransactionRejected,
          params: {
            accountId,
            metadata: {
              scope,
              origin,
              transactionType,
              ...securityMetadata,
            },
          },
        },
      },
    });

    return { confirmed: false, context };
  }

  /**
   * Handles the confirmation of a sign message request.
   *
   * @param request - The request to confirm.
   * @param account - The account that the request is for.
   * @returns The user's decision.
   */
  async #handleConfirmSignMessage(
    request: SolanaKeyringRequest,
    account: ExtendedKeyringAccount,
  ): Promise<ConfirmationOutcome> {
    const isConfirmed = await renderConfirmSignMessage(request, account);
    return { confirmed: Boolean(isConfirmed) };
  }

  /**
   * Handles the confirmation of a sign in request.
   *
   * @param request - The request to confirm.
   * @param account - The account that the request is for.
   * @returns The user's decision.
   */
  async #handleConfirmSignIn(
    request: SolanaKeyringRequest,
    account: ExtendedKeyringAccount,
  ): Promise<ConfirmationOutcome> {
    const isConfirmed = await renderConfirmSignIn(request, account);
    return { confirmed: Boolean(isConfirmed) };
  }
}
