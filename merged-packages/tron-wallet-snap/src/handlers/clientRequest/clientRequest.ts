import { TransactionStatus } from '@metamask/keyring-api';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import {
  InvalidParamsError,
  MethodNotFoundError,
  UserRejectedRequestError,
} from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { sha256 } from 'ethers';

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import { Network, Networks, NULL_ADDRESS, ZERO } from '../../constants';
import type { AccountsService } from '../../services/accounts/AccountsService';
import type { AssetsService } from '../../services/assets/AssetsService';
import type {
  NativeCaipAssetType,
  StakedCaipAssetType,
} from '../../services/assets/types';
import type { ConfirmationHandler } from '../../services/confirmation/ConfirmationHandler';
import type { FeeCalculatorService } from '../../services/send/FeeCalculatorService';
import type { SendService } from '../../services/send/SendService';
import type { StakingService } from '../../services/staking/StakingService';
import { TransactionMapper } from '../../services/transactions/TransactionsMapper';
import type { TransactionsService } from '../../services/transactions/TransactionsService';
import { assertOrThrow } from '../../utils/assertOrThrow';
import type { ILogger } from '../../utils/logger';
import { createPrefixedLogger } from '../../utils/logger';
import { BackgroundEventMethod } from '../cronjob';
import { ClientRequestMethod, SendErrorCodes } from './types';
import {
  ComputeFeeRequestStruct,
  ComputeFeeResponseStruct,
  ComputeStakeFeeRequestStruct,
  OnAddressInputRequestStruct,
  OnAmountInputRequestStruct,
  OnConfirmSendRequestStruct,
  OnConfirmStakeRequestStruct,
  OnConfirmUnstakeRequestStruct,
  OnStakeAmountInputRequestStruct,
  OnUnstakeAmountInputRequestStruct,
  parseRewardsMessage,
  SignAndSendTransactionRequestStruct,
  SignRewardsMessageRequestStruct,
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

  readonly #confirmationHandler: ConfirmationHandler;

  readonly #transactionsService: TransactionsService;

  constructor({
    logger,
    accountsService,
    assetsService,
    sendService,
    feeCalculatorService,
    tronWebFactory,
    snapClient,
    stakingService,
    confirmationHandler,
    transactionsService,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    assetsService: AssetsService;
    sendService: SendService;
    feeCalculatorService: FeeCalculatorService;
    tronWebFactory: TronWebFactory;
    snapClient: SnapClient;
    stakingService: StakingService;
    confirmationHandler: ConfirmationHandler;
    transactionsService: TransactionsService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[👋 ClientRequestHandler]');
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#sendService = sendService;
    this.#feeCalculatorService = feeCalculatorService;
    this.#tronWebFactory = tronWebFactory;
    this.#snapClient = snapClient;
    this.#stakingService = stakingService;
    this.#confirmationHandler = confirmationHandler;
    this.#transactionsService = transactionsService;
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
      case ClientRequestMethod.ComputeStakeFee:
        return this.#handleComputeStakeFee(request);
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
      /**
       * Sign Rewards Message
       */
      case ClientRequestMethod.SignRewardsMessage:
        return this.#handleSignRewardsMessage(request);
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
    const {
      transaction: transactionBase64,
      accountId,
      scope,
      options: { visible, type },
    } = request.params;

    const account = await this.#accountsService.findByIdOrThrow(accountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    /**
     * We need to rebuild the transaction due to some extra fields
     */
    // eslint-disable-next-line no-restricted-globals
    const rawDataHex = Buffer.from(transactionBase64, 'base64').toString('hex');
    const rawData = tronWeb.utils.deserializeTx.deserializeTransaction(
      type,
      rawDataHex,
    );
    const txID = sha256(`0x${rawDataHex}`).slice(2);
    const transaction = {
      visible,
      txID,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data: rawData,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data_hex: rawDataHex,
    };
    const signedTx = await tronWeb.trx.sign(transaction);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);

    if (!result.result) {
      throw new Error(`Failed to send transaction: ${result.message}`);
    }

    // Immediately create and save a minimal pending transaction
    // This shows the transaction to the user right away
    const pendingTransaction = TransactionMapper.createPendingTransaction({
      txId: result.txid,
      account,
      scope,
    });

    await this.#transactionsService.save(pendingTransaction);

    /**
     * Track transaction after a transaction
     */
    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.TrackTransaction,
      params: {
        txId: result.txid,
        scope,
        accountIds: [accountId],
        attempt: 0,
      },
      duration: 'PT1S',
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
   * - Asset must exist in the account
   * - Asset amount must not be greater than the account balance
   * - If native TRX + full amount, we need bandwidth
   * -
   *
   * @param request - The JSON-RPC request containing amount and asset details.
   * @returns Validation result with balance and sufficiency status.
   */
  async #handleOnAmountInput(request: JsonRpcRequest): Promise<Json> {
    try {
      assert(request, OnAmountInputRequestStruct);

      const { accountId, assetId, value } = request.params;
      const account = await this.#accountsService.findById(accountId);

      /**
       * Check if the account we want to send from exists...
       */
      if (!account) {
        return {
          valid: false,
          errors: [SendErrorCodes.Invalid],
        };
      }

      /**
       * Check if we have enough of the asset we want to send...
       */
      const { chainId } = parseCaipAssetType(assetId);
      const scope = chainId as Network;

      const [asset, nativeTokenAsset, bandwidthAsset, energyAsset] =
        await this.#assetsService.getAssetsByAccountId(accountId, [
          assetId,
          Networks[scope].nativeToken.id,
          Networks[scope].bandwidth.id,
          Networks[scope].energy.id,
        ]);

      const valueBN = new BigNumber(value);
      const assetToSendBalance = asset ? new BigNumber(asset.uiAmount) : ZERO;
      const nativeTokenBalance = nativeTokenAsset
        ? new BigNumber(nativeTokenAsset.uiAmount)
        : ZERO;
      const bandwidthBalance = bandwidthAsset
        ? new BigNumber(bandwidthAsset.uiAmount)
        : ZERO;
      const energyBalance = energyAsset
        ? new BigNumber(energyAsset.uiAmount)
        : ZERO;

      if (!asset || valueBN.isGreaterThan(assetToSendBalance)) {
        return {
          valid: false,
          errors: [SendErrorCodes.InsufficientBalance],
        };
      }

      /**
       * Estimate the fees
       */
      const sendTransaction = await this.#sendService.buildTransaction({
        fromAccountId: accountId,
        toAddress: NULL_ADDRESS,
        asset,
        amount: valueBN.toNumber(),
      });
      const fees = await this.#feeCalculatorService.computeFee({
        scope,
        transaction: sendTransaction,
        availableEnergy: energyBalance,
        availableBandwidth: bandwidthBalance,
      });

      /**
       * The fee calculation already takes into account the energy and bandwidth consumption,
       * so we only need to make sure we have enough TRX to cover overages.
       */
      const nativeTokenId = Networks[scope].nativeToken.id;
      const trxFee = new BigNumber(
        fees.find((fee) => fee.asset.type === nativeTokenId)?.asset.amount ??
          '0',
      );

      /**
       * Don't forget that we can also be sending TRX so we must add the fees to the amount that will be
       * sent.
       */
      const totalTrxToSpend =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        assetId === nativeTokenId ? valueBN.plus(trxFee) : trxFee;

      if (totalTrxToSpend.isGreaterThan(nativeTokenBalance)) {
        return {
          valid: false,
          errors: [SendErrorCodes.InsufficientBalanceToCoverFee],
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

    const account = await this.#accountsService.findById(fromAccountId);

    if (!account) {
      return {
        valid: false,
        errors: [SendErrorCodes.Invalid],
      };
    }

    const asset = await this.#assetsService.getAssetByAccountId(
      fromAccountId,
      assetId,
    );

    if (!asset) {
      return {
        valid: false,
        errors: [SendErrorCodes.InsufficientBalance],
      };
    }

    const { chainId } = parseCaipAssetType(assetId);
    const scope = chainId as Network;

    const amountBN = new BigNumber(amount);

    const [[bandwidthAsset, energyAsset], transaction] = await Promise.all([
      /**
       * Get available Energy and Bandwidth from account assets.
       */
      this.#assetsService.getAssetsByAccountId(fromAccountId, [
        Networks[scope].bandwidth.id,
        Networks[scope].energy.id,
      ]),
      /**
       * Build the transaction that will be sent.
       * The signature is included because we need it to correctly estimate fees.
       */
      this.#sendService.buildTransaction({
        fromAccountId,
        toAddress,
        asset,
        amount: amountBN.toNumber(),
      }),
    ]);

    const availableEnergy = energyAsset
      ? new BigNumber(energyAsset.rawAmount)
      : ZERO;
    const availableBandwidth = bandwidthAsset
      ? new BigNumber(bandwidthAsset.rawAmount)
      : ZERO;

    const fees = await this.#feeCalculatorService.computeFee({
      scope,
      transaction,
      availableEnergy,
      availableBandwidth,
    });

    /**
     * Show the confirmation UI
     */
    const confirmed = await this.#confirmationHandler.confirmTransactionRequest(
      {
        scope,
        fromAddress: account.address,
        toAddress,
        amount,
        fees,
        asset,
        accountType: account.type,
      },
    );

    if (!confirmed) {
      throw new UserRejectedRequestError() as unknown as Error;
    }

    /**
     * Send the built transaction
     */
    const result = await this.#sendService.sendTransaction({
      scope,
      fromAccountId,
      transaction,
    });

    // Immediately create and save a detailed pending Send transaction
    // This shows the transaction to the user right away with all details
    const pendingTransaction = TransactionMapper.createPendingSendTransaction({
      txId: result.txid,
      account,
      scope,
      toAddress,
      amount,
      assetType: assetId,
      assetSymbol: asset.symbol,
    });

    await this.#transactionsService.save(pendingTransaction);

    this.#logger.log(
      `Created pending Send transaction ${result.txid} for account ${account.id}`,
    );

    return {
      transactionId: result.txid,
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
      params: {
        scope,
        transaction: transactionBase64,
        accountId,
        options: { visible, type },
      },
    } = request;

    /**
     * Start by recreating the transaction object with the missing fields
     * just like we do for `signAndSendTransaction`
     */
    const account = await this.#accountsService.findByIdOrThrow(accountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    // eslint-disable-next-line no-restricted-globals
    const rawDataHex = Buffer.from(transactionBase64, 'base64').toString('hex');
    const rawData = tronWeb.utils.deserializeTx.deserializeTransaction(
      type,
      rawDataHex,
    );
    const txID = sha256(`0x${rawDataHex}`).slice(2);
    const transaction = {
      visible,
      txID,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data: rawData,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data_hex: rawDataHex,
    };
    const signedTransaction = await tronWeb.trx.sign(transaction);

    /**
     * Get available Energy and Bandwidth from account assets.
     */
    const [bandwidthAsset, energyAsset] =
      await this.#assetsService.getAssetsByAccountId(accountId, [
        Networks[scope].bandwidth.id,
        Networks[scope].energy.id,
      ]);

    const availableEnergy = energyAsset
      ? new BigNumber(energyAsset.rawAmount)
      : ZERO;
    const availableBandwidth = bandwidthAsset
      ? new BigNumber(bandwidthAsset.rawAmount)
      : ZERO;

    /**
     * Calculate complete fee breakdown using the service.
     */
    const result = await this.#feeCalculatorService.computeFee({
      scope,
      transaction: signedTransaction,
      availableEnergy,
      availableBandwidth,
    });

    assert(result, ComputeFeeResponseStruct);

    return result;
  }

  /**
   * Computes a fee preview for a staking transaction.
   * It builds and signs a freezeBalanceV2 transaction on the fly and uses the
   * FeeCalculatorService to estimate resource usage and TRX cost.
   *
   * @param request - The JSON-RPC request containing staking details.
   * @returns The detailed fee breakdown for the staking transaction.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async #handleComputeStakeFee(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      ComputeStakeFeeRequestStruct,
      new InvalidParamsError(),
    );

    const {
      fromAccountId,
      value,
      options: { purpose },
    } = request.params;

    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const scope = Network.Mainnet;

    const asset = await this.#assetsService.getAssetByAccountId(
      fromAccountId,
      Networks[scope].nativeToken.id,
    );

    const accountBalance = asset ? new BigNumber(asset.uiAmount) : ZERO;
    const requestBalance = BigNumber(value);

    /**
     * Check if account has enough of the asset for staking.
     */
    if (requestBalance.isGreaterThan(accountBalance)) {
      return {
        valid: false,
        errors: [SendErrorCodes.InsufficientBalance],
      };
    }

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    const amountInSun = requestBalance.multipliedBy(10 ** 6).toNumber();
    const transaction = await tronWeb.transactionBuilder.freezeBalanceV2(
      amountInSun,
      purpose,
      account.address,
    );

    const signedTransaction = await tronWeb.trx.sign(transaction);

    /**
     * Get available Energy and Bandwidth from account assets.
     */
    const [bandwidthAsset, energyAsset] =
      await this.#assetsService.getAssetsByAccountId(fromAccountId, [
        Networks[scope].bandwidth.id,
        Networks[scope].energy.id,
      ]);

    const availableEnergy = energyAsset
      ? BigNumber(energyAsset.rawAmount)
      : ZERO;
    const availableBandwidth = bandwidthAsset
      ? BigNumber(bandwidthAsset.rawAmount)
      : ZERO;

    /**
     * Calculate complete fee breakdown using the service.
     */
    const result = await this.#feeCalculatorService.computeFee({
      scope,
      transaction: signedTransaction,
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
    const accountBalance = asset ? new BigNumber(asset.uiAmount) : ZERO;
    const requestBalance = new BigNumber(value);

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

    const accountBalance = asset ? new BigNumber(asset.uiAmount) : ZERO;
    const requestBalance = new BigNumber(value);
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

    const {
      accountId,
      assetId,
      value,
      options: { purpose },
    } = request.params;

    /**
     * We convert the `slip44:195` to `slip44:195-staked-for-bandwidth` or `slip44:195-staked-for-energy`
     * depending on the purpose.
     */
    const stakedAssetId = `${assetId}-staked-for-${purpose.toLowerCase()}`;

    await this.#accountsService.findByIdOrThrow(accountId);
    const asset = await this.#assetsService.getAssetByAccountId(
      accountId,
      stakedAssetId,
    );

    const accountBalance = asset ? new BigNumber(asset.uiAmount) : ZERO;
    const requestBalance = new BigNumber(value);

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
      OnConfirmUnstakeRequestStruct,
      new InvalidParamsError(),
    );

    const {
      accountId,
      assetId,
      value,
      options: { purpose },
    } = request.params;

    /**
     * We convert the `slip44:195-staked-for-bandwidth` or `slip44:195-staked-for-energy` to `slip44:195`
     * depending on the purpose.
     */
    const stakedAssetId =
      `${assetId}-staked-for-${purpose.toLowerCase()}` as StakedCaipAssetType;

    const account = await this.#accountsService.findByIdOrThrow(accountId);

    const asset = await this.#assetsService.getAssetByAccountId(
      accountId,
      stakedAssetId,
    );

    const accountBalance = asset ? new BigNumber(asset.uiAmount) : ZERO;
    const requestBalance = new BigNumber(value);

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
      assetId: stakedAssetId,
      amount: requestBalance,
    });

    return {
      valid: true,
      errors: [],
    };
  }

  /**
   * Handles signing a rewards message without confirmation.
   *
   * @param request - The JSON-RPC request containing the message to sign.
   * @returns The signature, signed message, and signature type.
   */
  async #handleSignRewardsMessage(request: JsonRpcRequest): Promise<Json> {
    assertOrThrow(
      request,
      SignRewardsMessageRequestStruct,
      new InvalidParamsError(),
    );

    const {
      params: { accountId, message },
    } = request;

    const account = await this.#accountsService.findById(accountId);
    if (!account) {
      throw new InvalidParamsError(`Account not found: ${accountId}`) as Error;
    }

    // Parse the rewards message to extract the address
    const { address: messageAddress } = parseRewardsMessage(message);

    // Validate that the address in the message matches the signing account
    if (messageAddress !== account.address) {
      throw new InvalidParamsError(
        `Address in rewards message (${messageAddress}) does not match signing account address (${account.address})`,
      ) as Error;
    }

    // Derive the private key for signing
    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    // Create a TronWeb instance for message signing
    // We can use any network scope since we're just signing a message
    const tronWeb = this.#tronWebFactory.createClient(
      Network.Mainnet,
      privateKeyHex,
    );

    // Decode the base64 message to get the raw message
    // eslint-disable-next-line no-restricted-globals
    const decodedMessage = Buffer.from(message, 'base64').toString('utf8');

    // Sign the message using TronWeb's signMessageV2
    const signature = tronWeb.trx.signMessageV2(decodedMessage, privateKeyHex);

    return {
      signature,
      signedMessage: message,
      signatureType: 'secp256k1',
    };
  }
}
