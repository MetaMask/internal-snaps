import { assert } from '@metamask/superstruct';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import type { AssetEntity } from '../../entities/assets';
import { TronMultichainMethod } from '../../handlers/keyring-types';
import { render as renderConfirmSignMessage } from '../../ui/confirmation/views/ConfirmSignMessage/render';
import { render as renderConfirmSignTransaction } from '../../ui/confirmation/views/ConfirmSignTransaction/render';
import { render as renderConfirmTransactionRequest } from '../../ui/confirmation/views/ConfirmTransactionRequest/render';
import { formatOrigin } from '../../utils/formatOrigin';
import type { ILogger } from '../../utils/logger';
import logger, { createPrefixedLogger } from '../../utils/logger';
import {
  SignTransactionRequestStruct,
  type TronWalletKeyringRequest,
} from '../../validation/structs';
import type { AccountsService } from '../accounts/AccountsService';
import type { ComputeFeeResult } from '../send/types';
import type { State, UnencryptedStateValue } from '../state/State';

export class ConfirmationHandler {
  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  readonly #state: State<UnencryptedStateValue>;

  readonly #accountsService: AccountsService;

  readonly #tronWebFactory: TronWebFactory;

  constructor({
    snapClient,
    state,
    accountsService,
    tronWebFactory,
  }: {
    snapClient: SnapClient;
    state: State<UnencryptedStateValue>;
    accountsService: AccountsService;
    tronWebFactory: TronWebFactory;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 ConfirmationHandler]');
    this.#snapClient = snapClient;
    this.#state = state;
    this.#accountsService = accountsService;
    this.#tronWebFactory = tronWebFactory;
  }

  async handleKeyringRequest({
    request,
    account,
  }: {
    request: TronWalletKeyringRequest;
    account: TronKeyringAccount;
  }): Promise<boolean> {
    this.#logger.info('Handling keyring request', {
      request,
      account,
    });

    const { method } = request.request;

    // Handle different request types
    switch (method as TronMultichainMethod) {
      case TronMultichainMethod.SignMessage: {
        return this.#handleSignMessageRequest(request, account);
      }
      case TronMultichainMethod.SignTransaction: {
        return this.#handleSignTransactionRequest(request, account);
      }
      default:
        this.#logger.warn('Unhandled keyring request method', { method });
        throw new Error(`Unhandled keyring request method: ${method}`);
    }

    return false;
  }

  async #handleSignMessageRequest(
    request: TronWalletKeyringRequest,
    account: TronKeyringAccount,
  ): Promise<boolean> {
    const result = await renderConfirmSignMessage(request, account);
    return result === true;
  }

  async #handleSignTransactionRequest(
    request: TronWalletKeyringRequest,
    account: TronKeyringAccount,
  ): Promise<boolean> {
    assert(request.request.params, SignTransactionRequestStruct);

    const {
      scope,
      request: {
        params: {
          transaction: { rawDataHex, type },
        },
      },
    } = request;

    // Derive the private key for signing
    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    // Create a TronWeb instance for transaction signing
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    // Rebuild the transaction from hex (same logic as clientRequest handler)
    const rawData = tronWeb.utils.deserializeTx.deserializeTransaction(
      type,
      rawDataHex,
    );

    const result = await renderConfirmSignTransaction(
      request,
      account,
      rawData,
    );
    return result === true;
  }

  async confirmTransactionRequest({
    scope,
    fromAddress,
    toAddress,
    amount,
    fees,
    asset,
    accountType,
    origin,
  }: {
    scope: Network;
    fromAddress: string;
    toAddress: string;
    amount: string;
    fees: ComputeFeeResult;
    asset: AssetEntity;
    accountType: string;
    origin: string;
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
        origin: formatOrigin(origin),
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
