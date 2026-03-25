import { InternalError } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';
import type { Types } from 'tronweb';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import { type Network, Networks, ZERO } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import type { TronKeyringAccount } from '../../entities/keyring-account';
import { TronMultichainMethod } from '../../handlers/keyring-types';
import { TRX_IMAGE_SVG } from '../../static/tron-logo';
import { FetchStatus } from '../../types/snap';
import { getIconUrlForKnownAsset } from '../../ui/confirmation/utils/getIconUrlForKnownAsset';
import { render as renderConfirmSignMessage } from '../../ui/confirmation/views/ConfirmSignMessage/render';
import { ConfirmSignTransaction } from '../../ui/confirmation/views/ConfirmSignTransaction/ConfirmSignTransaction';
import { render as renderConfirmSignTransaction } from '../../ui/confirmation/views/ConfirmSignTransaction/render';
import type { ConfirmSignTransactionContext } from '../../ui/confirmation/views/ConfirmSignTransaction/types';
import { render as renderConfirmTransactionRequest } from '../../ui/confirmation/views/ConfirmTransactionRequest/render';
import { formatOrigin } from '../../utils/formatOrigin';
import type { ILogger } from '../../utils/logger';
import logger, { createPrefixedLogger } from '../../utils/logger';
import {
  SignTransactionRequestStruct,
  type TronWalletKeyringRequest,
} from '../../validation/structs';
import { assertTransactionStructure } from '../../validation/transaction';
import type { AssetsService } from '../assets/AssetsService';
import type { FeeCalculatorService } from '../send/FeeCalculatorService';
import type { ComputeFeeResult } from '../send/types';
import type { State, UnencryptedStateValue } from '../state/State';

export class ConfirmationHandler {
  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  readonly #state: State<UnencryptedStateValue>;

  readonly #tronWebFactory: TronWebFactory;

  readonly #assetsService: AssetsService;

  readonly #feeCalculatorService: FeeCalculatorService;

  constructor({
    snapClient,
    state,
    tronWebFactory,
    assetsService,
    feeCalculatorService,
  }: {
    snapClient: SnapClient;
    state: State<UnencryptedStateValue>;
    tronWebFactory: TronWebFactory;
    assetsService: AssetsService;
    feeCalculatorService: FeeCalculatorService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🔑 ConfirmationHandler]');
    this.#snapClient = snapClient;
    this.#state = state;
    this.#tronWebFactory = tronWebFactory;
    this.#assetsService = assetsService;
    this.#feeCalculatorService = feeCalculatorService;
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

    // Create a TronWeb instance for transaction deserialization
    const tronWeb = this.#tronWebFactory.createClient(scope);

    // Rebuild the transaction from hex (same logic as clientRequest handler)
    const rawData = tronWeb.utils.deserializeTx.deserializeTransaction(
      type,
      rawDataHex,
    );
    assertTransactionStructure(rawData);

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
    transactionRawData,
  }: {
    scope: Network;
    fromAddress: string;
    toAddress: string;
    amount: string;
    fees: ComputeFeeResult;
    asset: AssetEntity;
    accountType: string;
    origin: string;
    transactionRawData: Types.Transaction['raw_data'];
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
        accountType,
        transactionRawData,
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

  /**
   * Shows a confirmation dialog for claiming unstaked TRX,
   * reusing the ConfirmSignTransaction UI component.
   *
   * Builds an unsigned transaction to estimate fees, then presents
   * the user with an approval dialog before any signing occurs.
   *
   * @param params - The parameters for the confirmation.
   * @param params.account - The account claiming the unstaked TRX.
   * @param params.scope - The network scope.
   * @returns True if the user confirmed, false otherwise.
   */
  async confirmClaimUnstakedTrx({
    account,
    scope,
  }: {
    account: TronKeyringAccount;
    scope: Network;
  }): Promise<boolean> {
    const tronWeb = this.#tronWebFactory.createClient(scope);
    const unsignedTx = await tronWeb.transactionBuilder.withdrawExpireUnfreeze(
      account.address,
    );

    const [bandwidthAsset, energyAsset] =
      await this.#assetsService.getAssetsByAccountId(account.id, [
        Networks[scope].bandwidth.id,
        Networks[scope].energy.id,
      ]);

    const availableEnergy = energyAsset
      ? new BigNumber(energyAsset.rawAmount)
      : ZERO;
    const availableBandwidth = bandwidthAsset
      ? new BigNumber(bandwidthAsset.rawAmount)
      : ZERO;

    const fees = await this.#feeCalculatorService.computeFee({
      scope,
      transaction: unsignedTx,
      availableEnergy,
      availableBandwidth,
    });

    fees.forEach((fee) => {
      fee.asset.iconUrl = getIconUrlForKnownAsset(fee.asset.type);
    });

    let preferences;
    try {
      preferences = await this.#snapClient.getPreferences();
    } catch {
      throw new InternalError('Failed to retrieve Snap preferences.') as Error;
    }

    const context: ConfirmSignTransactionContext = {
      scope,
      account,
      transaction: { rawDataHex: '', type: '' },
      origin: 'MetaMask',
      preferences,
      networkImage: TRX_IMAGE_SVG,
      scan: null,
      scanFetchStatus: FetchStatus.Fetched,
      tokenPrices: {},
      tokenPricesFetchStatus: FetchStatus.Fetched,
      fees,
      feesFetchStatus: FetchStatus.Fetched,
    };

    const ui = ConfirmSignTransaction({ context });
    const id = await this.#snapClient.createInterface(ui, context);

    const result = await this.#snapClient.showDialog(id);
    return result === true;
  }
}
