import { TransactionStatus } from '@metamask/keyring-api';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import { InvalidParamsError, MethodNotFoundError } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import { Networks } from '../../constants';
import type { AccountsService } from '../../services/accounts/AccountsService';
import type { AssetsService } from '../../services/assets/AssetsService';
import type {
  NativeCaipAssetType,
  StakedCaipAssetType,
} from '../../services/assets/types';
import type { FeeCalculatorService } from '../../services/send/FeeCalculatorService';
import type { SendService } from '../../services/send/SendService';
import type { StakingService } from '../../services/staking/StakingService';
import { assertOrThrow } from '../../utils/assertOrThrow';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';
import { BackgroundEventMethod } from '../cronjob';
import { ClientRequestMethod, SendErrorCodes } from './types';
import {
  ComputeFeeRequestStruct,
  ComputeFeeResponseStruct,
  OnAddressInputRequestStruct,
  OnAmountInputRequestStruct,
  OnConfirmSendRequestStruct,
  OnConfirmStakeRequestStruct,
  OnStakeAmountInputRequestStruct,
  OnUnstakeAmountInputRequestStruct,
  SignAndSendTransactionRequestStruct,
} from './validation';

export class ClientRequestHandler {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #sendService: SendService;

  readonly #tronWebFactory: TronWebFactory;

  readonly #feeCalculatorService: FeeCalculatorService;

  readonly #snapClient: SnapClient;

  readonly #stakingService: StakingService;

  constructor({
    logger,
    accountsService,
    assetsService,
    sendService,
    feeCalculatorService,
    tronWebFactory,
    snapClient,
    stakingService,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    assetsService: AssetsService;
    sendService: SendService;
    feeCalculatorService: FeeCalculatorService;
    tronWebFactory: TronWebFactory;
    snapClient: SnapClient;
    stakingService: StakingService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[👋 ClientRequestHandler]');
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#sendService = sendService;
    this.#feeCalculatorService = feeCalculatorService;
    this.#tronWebFactory = tronWebFactory;
    this.#snapClient = snapClient;
    this.#stakingService = stakingService;
  }

  /**
   * Handles JSON-RPC requests originating exclusively from the client - as defined in [SIP-31](https://github.com/MetaMask/SIPs/blob/main/SIPS/sip-31.md) -
   * by routing them to the appropriate use case, based on the method. Some methods need to be implemented
   * as part of the [Unified Non-EVM Send](https://www.notion.so/metamask-consensys/Unified-Non-EVM-Send-248f86d67d6880278445f9ad75478471) specification.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   * @throws {MethodNotFoundError} If the method is not found.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async handle(request: JsonRpcRequest): Promise<Json> {
    this.#logger.log('Handling client request', request);

    const { method } = request;

    switch (method as ClientRequestMethod) {
      /**
       * Wallet Standard
       */
      case ClientRequestMethod.SignAndSendTransaction:
        return this.#handleSignAndSendTransaction(request);
      /**
       * Unified non-EVM Send
       */
      case ClientRequestMethod.OnAddressInput:
        return this.#handleOnAddressInput(request);
      case ClientRequestMethod.OnAmountInput:
        return this.#handleOnAmountInput(request);
      case ClientRequestMethod.ConfirmSend:
        return this.#handleConfirmSend(request);
      case ClientRequestMethod.ComputeFee:
        return this.#handleComputeFee(request);
      /**
       * Staking
       */
      case ClientRequestMethod.OnStakeAmountInput:
        return this.#handleOnStakeAmountInput(request);
      case ClientRequestMethod.ConfirmStake:
        return this.#handleConfirmStake(request);
      case ClientRequestMethod.OnUnstakeAmountInput:
        return this.#handleOnUnstakeAmountInput(request);
      case ClientRequestMethod.ConfirmUnstake:
        return this.#handleConfirmUnstake(request);
      default:
        throw new MethodNotFoundError() as Error;
    }
  }

  /**
   * Handles the signing and sending of a transaction.
   *
   * @param request - The JSON-RPC request containing transaction details.
   * @returns The transaction result with hash and status.
   */
  async #handleSignAndSendTransaction(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      SignAndSendTransactionRequestStruct,
      new InvalidParamsError(),
    );

    /**
     * Transaction here is in base64 format.
     */
    const { transaction: transactionBase64, accountId, scope } = request.params;

    const account = await this.#accountsService.findByIdOrThrow(accountId);

    const keypair = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    // eslint-disable-next-line no-restricted-globals
    const privateKeyHex = Buffer.from(keypair.privateKeyBytes).toString('hex');
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    /**
     * `sign` expects either a Transaction object or a hex string.
     */
    // eslint-disable-next-line no-restricted-globals
    const transactionHex = Buffer.from(transactionBase64, 'base64').toString(
      'hex',
    );
    const signedTx = await tronWeb.trx.sign(transactionHex);
    const result = await tronWeb.trx.sendHexTransaction(signedTx);

    /**
     * Sync account after a transaction
     */
    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.SynchronizeAccount,
      params: { accountId },
      duration: 'PT5S',
    });

    return {
      transactionId: result.txid,
    };
  }

  /**
   * Handles the input of an address.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   */
  async #handleOnAddressInput(request: JsonRpcRequest): Promise<Json> {
    try {
      assert(request, OnAddressInputRequestStruct);
      return {
        valid: true,
        errors: [],
      };
    } catch {
      return {
        valid: false,
        errors: [SendErrorCodes.Invalid],
      };
    }
  }

  /**
   * Handles amount input validation and balance checking.
   *
   * @param request - The JSON-RPC request containing amount and asset details.
   * @returns Validation result with balance and sufficiency status.
   */
  async #handleOnAmountInput(request: JsonRpcRequest): Promise<Json> {
    try {
      assert(request, OnAmountInputRequestStruct);

      /**
       * Check if the user has enough of the asset
       */
      const { accountId, assetId, value } = request.params;
      const account = await this.#accountsService.findById(accountId);

      /**
       * The account does not exist...
       */
      if (!account) {
        return {
          valid: false,
          errors: [SendErrorCodes.Invalid],
        };
      }

      const asset = await this.#assetsService.getAssetByAccountId(
        accountId,
        assetId,
      );

      /**
       * If the account doesn't have this asset, treat it as having zero balance
       */
      const balance = asset ? BigNumber(asset.uiAmount) : BigNumber(0);
      const amount = BigNumber(value);

      if (amount.isGreaterThan(balance)) {
        return {
          valid: false,
          errors: [SendErrorCodes.InsufficientBalance],
        };
      }

      return {
        valid: true,
        errors: [],
      };
    } catch (error) {
      this.#logger.error('Error in #handleOnAmountInput:', error);
      return {
        valid: false,
        errors: [SendErrorCodes.Invalid],
      };
    }
  }

  /**
   * Handles the confirmation and sending of a transaction.
   *
   * @param request - The JSON-RPC request containing transaction details.
   * @returns The transaction result with hash and status.
   */
  async #handleConfirmSend(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      OnConfirmSendRequestStruct,
      new InvalidParamsError(),
    );

    const { fromAccountId, toAddress, amount, assetId } = request.params;

    const transaction = await this.#sendService.sendAsset({
      fromAccountId,
      toAddress,
      amount: BigNumber(amount).toNumber(),
      assetId,
    });

    return {
      transactionId: transaction.txId,
      status: TransactionStatus.Submitted,
    };
  }

  /**
   * Handles the computation of a fee for a TRON transaction.
   * Returns used energy, used bandwidth, and the additional TRX cost breakdown for overages.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request with the detailed fee breakdown.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async #handleComputeFee(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(request, ComputeFeeRequestStruct, new InvalidParamsError());

    const {
      params: { scope, transaction, accountId },
    } = request;

    await this.#accountsService.findByIdOrThrow(accountId);

    /**
     * Get available Energy and Bandwidth from account assets.
     */
    const energyAsset = await this.#assetsService.getAssetByAccountId(
      accountId,
      Networks[scope].energy.id,
    );
    const bandwidthAsset = await this.#assetsService.getAssetByAccountId(
      accountId,
      Networks[scope].bandwidth.id,
    );

    const availableEnergy = energyAsset
      ? BigNumber(energyAsset.rawAmount)
      : BigNumber(0);
    const availableBandwidth = bandwidthAsset
      ? BigNumber(bandwidthAsset.rawAmount)
      : BigNumber(0);

    /**
     * Calculate complete fee breakdown using the service.
     */
    const result = await this.#feeCalculatorService.computeFee({
      scope,
      transaction,
      availableEnergy,
      availableBandwidth,
    });

    assert(result, ComputeFeeResponseStruct);

    return result;
  }

  /**
   * Handles the input of a stake amount. Checks if the user has enough of the asset
   * to do the stake.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   */
  async #handleOnStakeAmountInput(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      OnStakeAmountInputRequestStruct,
      new InvalidParamsError(),
    );

    const { accountId, assetId, value } = request.params;

    await this.#accountsService.findByIdOrThrow(accountId);
    const asset = await this.#assetsService.getAssetByAccountId(
      accountId,
      assetId,
    );

    /**
     * If the account doesn't have this asset, treat it as having zero balance
     */
    const accountBalance = asset ? BigNumber(asset.uiAmount) : BigNumber(0);
    const requestBalance = BigNumber(value);

    if (requestBalance.isGreaterThan(accountBalance)) {
      return {
        valid: false,
        errors: [SendErrorCodes.InsufficientBalance],
      };
    }

    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * Handles the confirmation of a stake. Checks if the user has enough of the asset
   * to do the stake and then stakes the asset.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   */
  async #handleConfirmStake(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      OnConfirmStakeRequestStruct,
      new InvalidParamsError(),
    );

    const {
      fromAccountId,
      assetId,
      value,
      options: { purpose },
    } = request.params;

    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);
    const asset = await this.#assetsService.getAssetByAccountId(
      fromAccountId,
      assetId,
    );

    const accountBalance = asset ? BigNumber(asset.uiAmount) : BigNumber(0);
    const requestBalance = BigNumber(value);

    /**
     * Check if account has enough of the asset...
     */
    if (requestBalance.isGreaterThan(accountBalance)) {
      return {
        valid: false,
        errors: [SendErrorCodes.InsufficientBalance],
      };
    }

    /**
     * All good. Let's stake.
     */
    await this.#stakingService.stake({
      account,
      assetId: assetId as NativeCaipAssetType,
      amount: requestBalance,
      purpose,
    });

    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * Check if we have enough of the asset to unstake. Keep in mind
   * that you can unstake TRX that is allocated for Bandwidth or for Energy.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   */
  async #handleOnUnstakeAmountInput(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      OnUnstakeAmountInputRequestStruct,
      new InvalidParamsError(),
    );

    const { accountId, assetId, value } = request.params;

    await this.#accountsService.findByIdOrThrow(accountId);
    const asset = await this.#assetsService.getAssetByAccountId(
      accountId,
      assetId,
    );

    const accountBalance = asset ? BigNumber(asset.uiAmount) : BigNumber(0);
    const requestBalance = BigNumber(value);

    /**
     * Check if account has enough of the asset...
     */
    if (requestBalance.isGreaterThan(accountBalance)) {
      return {
        valid: false,
        errors: [SendErrorCodes.InsufficientBalance],
      };
    }

    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * Handles the confirmation of an unstake. Checks if the user has enough of the asset
   * to do the unstake.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   */
  async #handleConfirmUnstake(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      OnUnstakeAmountInputRequestStruct,
      new InvalidParamsError(),
    );

    const { accountId, assetId, value } = request.params;

    const account = await this.#accountsService.findByIdOrThrow(accountId);
    const asset = await this.#assetsService.getAssetByAccountId(
      accountId,
      assetId,
    );

    const accountBalance = asset ? BigNumber(asset.uiAmount) : BigNumber(0);
    const requestBalance = BigNumber(value);

    /**
     * Check if account has enough of the asset...
     */
    if (requestBalance.isGreaterThan(accountBalance)) {
      return {
        valid: false,
        errors: [SendErrorCodes.InsufficientBalance],
      };
    }

    /**
     * All good. Let's unstake.
     */
    await this.#stakingService.unstake({
      account,
      assetId: assetId as StakedCaipAssetType,
      amount: requestBalance,
    });

    return {
      valid: true,
      errors: [],
    };
  }
}
