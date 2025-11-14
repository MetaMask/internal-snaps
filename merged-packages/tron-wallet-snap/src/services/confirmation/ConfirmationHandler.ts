import type { SnapClient } from '../../clients/snap/SnapClient';
import type { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { render as renderConfirmTransactionRequest } from '../../ui/confirmation/views/ConfirmTransactionRequest/render';
import type { ComputeFeeResult } from '../send/types';

export class ConfirmationHandler {
  readonly #snapClient: SnapClient;

  constructor({ snapClient }: { snapClient: SnapClient }) {
    this.#snapClient = snapClient;
  }

  async confirmTransactionRequest({
    scope,
    fromAddress,
    toAddress,
    amount,
    fees,
    asset,
    accountType,
    origin = 'MetaMask',
  }: {
    scope: Network;
    fromAddress: string;
    toAddress: string;
    amount: string;
    fees: ComputeFeeResult;
    asset: AssetEntity;
    accountType: string;
    origin?: string;
  }): Promise<boolean> {
    // Track Transaction Added event
    await this.#snapClient.trackTransactionAdded({
      origin,
      accountType,
      chainIdCaip: scope,
    });

    const result = await renderConfirmTransactionRequest(this.#snapClient, {
      scope,
      fromAddress,
      toAddress,
      amount,
      fees,
      asset,
      origin,
    });

    // Track Transaction Rejected event if user rejects
    if (result === true) {
      await this.#snapClient.trackTransactionApproved({
        origin,
        accountType,
        chainIdCaip: scope,
      });
    } else {
      await this.#snapClient.trackTransactionRejected({
        origin,
        accountType,
        chainIdCaip: scope,
      });
    }

    return result === true;
  }
}
