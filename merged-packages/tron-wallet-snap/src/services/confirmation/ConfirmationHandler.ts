import type { KeyringRequest } from '@metamask/keyring-api';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import type { AssetEntity } from '../../entities/assets';
import { render as renderConfirmTransactionRequest } from '../../ui/confirmation/views/ConfirmTransactionRequest/render';
import type { ILogger } from '../../utils/logger';
import logger, { createPrefixedLogger } from '../../utils/logger';
import type { ComputeFeeResult } from '../send/types';
import type { State, UnencryptedStateValue } from '../state/State';

export class ConfirmationHandler {
  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  readonly #state: State<UnencryptedStateValue>;

  constructor({
    snapClient,
    state,
  }: {
    snapClient: SnapClient;
    state: State<UnencryptedStateValue>;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 ConfirmationHandler]');
    this.#snapClient = snapClient;
    this.#state = state;
  }

  async handleKeyringRequest({
    request,
    account,
  }: {
    request: KeyringRequest;
    account: TronKeyringAccount;
  }): Promise<boolean> {
    this.#logger.info('Handling keyring request', {
      request,
      account,
    });

    // TODO: Implement keyring request confirmation
    return true;
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

    const result = await renderConfirmTransactionRequest(
      this.#snapClient,
      this.#state,
      {
        scope,
        fromAddress,
        toAddress,
        amount,
        fees,
        asset,
        origin: 'MetaMask',
      },
    );

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
