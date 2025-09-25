import { FeeType, TransactionStatus } from '@metamask/keyring-api';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import { InvalidParamsError, MethodNotFoundError } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import { ClientRequestMethod, SendErrorCodes } from './types';
import type { ComputeFeeResponse } from './validation';
import {
  ComputeFeeRequestStruct,
  ComputeFeeResponseStruct,
  OnAddressInputRequestStruct,
  OnAmountInputRequestStruct,
  OnConfirmSendRequestStruct,
} from './validation';
import { Networks } from '../../constants';
import type { AccountsService } from '../../services/accounts/AccountsService';
import type { AssetsService } from '../../services/assets/AssetsService';
import type { SendService } from '../../services/send/SendService';
import { createPrefixedLogger } from '../../utils/logger';
import type { ILogger } from '../../utils/logger';

export class ClientRequestHandler {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #sendService: SendService;

  constructor({
    logger,
    accountsService,
    assetsService,
    sendService,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    assetsService: AssetsService;
    sendService: SendService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[👋 ClientRequestHandler]');
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#sendService = sendService;
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
      case ClientRequestMethod.ConfirmSend:
        return this.#handleConfirmSend(request);
      case ClientRequestMethod.ComputeFee:
        return this.#handleComputeFee(request);
      case ClientRequestMethod.OnAddressInput:
        return this.#handleOnAddressInput(request);
      case ClientRequestMethod.OnAmountInput:
        return this.#handleOnAmountInput(request);
      default:
        throw new MethodNotFoundError() as Error;
    }
  }

  /**
   * Handles the confirmation and sending of a transaction.
   *
   * @param request - The JSON-RPC request containing transaction details.
   * @returns The transaction result with hash and status.
   */
  async #handleConfirmSend(request: JsonRpcRequest): Promise<Json> {
    try {
      assert(request, OnConfirmSendRequestStruct);
    } catch (error) {
      const errorToThrow = new InvalidParamsError() as Error;
      errorToThrow.cause = error;
      throw errorToThrow;
    }

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
   * Handles the input of an address.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async #handleOnAddressInput(request: JsonRpcRequest): Promise<Json> {
    try {
      assert(request, OnAddressInputRequestStruct);
    } catch (error) {
      const errorToThrow = new InvalidParamsError() as Error;
      errorToThrow.cause = error;
      throw errorToThrow;
    }

    // If we reach this point, the address is valid (validated by TronAddressStruct)
    return {
      valid: true,
      errors: [],
    };
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
    } catch (error) {
      const errorToThrow = new InvalidParamsError() as Error;
      errorToThrow.cause = error;
      throw errorToThrow;
    }

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

    const accountAssets =
      await this.#assetsService.getByKeyringAccountId(accountId);
    const asset = accountAssets.find(
      (assetItem) => assetItem.assetType === assetId,
    );

    /**
     * The account does not have this asset...
     */
    if (!asset) {
      return {
        valid: false,
        errors: [SendErrorCodes.Invalid],
      };
    }

    const balance = BigNumber(asset.uiAmount);
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
  }

  /**
   * Handles the computation of a fee for a transaction.
   *
   * @param request - The JSON-RPC request containing the method and parameters.
   * @returns The response to the JSON-RPC request.
   * @throws {InvalidParamsError} If the params are invalid.
   */
  async #handleComputeFee(request: JsonRpcRequest): Promise<Json> {
    try {
      assert(request, ComputeFeeRequestStruct);
    } catch (error) {
      const errorToThrow = new InvalidParamsError() as Error;
      errorToThrow.cause = error;
      throw errorToThrow;
    }

    const {
      params: { scope },
    } = request;

    // TODO: Implement actual fee computation logic here.
    const { baseFee, priorityFee } = { baseFee: '0', priorityFee: '0' };

    const units = Networks[scope].nativeToken.symbol;
    const type = Networks[scope].nativeToken.id;

    const result: ComputeFeeResponse = [
      {
        type: FeeType.Base,
        asset: {
          unit: units,
          type,
          amount: baseFee,
          fungible: true,
        },
      },
      {
        type: FeeType.Priority,
        asset: {
          unit: units,
          type,
          amount: priorityFee,
          fungible: true,
        },
      },
    ];

    assert(result, ComputeFeeResponseStruct);

    return result;
  }
}
