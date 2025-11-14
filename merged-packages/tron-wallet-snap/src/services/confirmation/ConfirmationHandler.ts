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
  }: {
    scope: Network;
    fromAddress: string;
    toAddress: string;
    amount: string;
    fees: ComputeFeeResult;
    asset: AssetEntity;
  }): Promise<boolean> {
    const result = await renderConfirmTransactionRequest(this.#snapClient, {
      scope,
      fromAddress,
      toAddress,
      amount,
      fees,
      asset,
      origin: 'MetaMask',
    });

    return result === true;
  }
}
