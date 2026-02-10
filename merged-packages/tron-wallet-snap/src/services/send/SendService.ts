import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { TronWeb } from 'tronweb';
import type {
  BroadcastReturn,
  Transaction,
  TransferAssetContract,
  TransferContract,
  TriggerSmartContract,
} from 'tronweb/lib/esm/types';

import type { FeeCalculatorService } from './FeeCalculatorService';
import type { SendValidationResult } from './types';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import { Networks, ZERO } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { SendErrorCodes } from '../../handlers/clientRequest/types';
import { BackgroundEventMethod } from '../../handlers/cronjob';
import { toRawAmount, trxToSun } from '../../utils/conversion';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { AccountsService } from '../accounts/AccountsService';
import type { AssetsService } from '../assets/AssetsService';

export class SendService {
  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #tronWebFactory: TronWebFactory;

  readonly #feeCalculatorService: FeeCalculatorService;

  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  constructor({
    accountsService,
    assetsService,
    tronWebFactory,
    feeCalculatorService,
    logger,
    snapClient,
  }: {
    accountsService: AccountsService;
    assetsService: AssetsService;
    tronWebFactory: TronWebFactory;
    feeCalculatorService: FeeCalculatorService;
    logger: ILogger;
    snapClient: SnapClient;
  }) {
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#tronWebFactory = tronWebFactory;
    this.#feeCalculatorService = feeCalculatorService;
    this.#logger = createPrefixedLogger(logger, '[💸 SendService]');
    this.#snapClient = snapClient;
  }

  /**
   * Validates that the user has enough funds to complete the send operation.
   * This includes both the amount being sent and all associated fees
   * (bandwidth, energy overages, and account activation if applicable).
   *
   * @param params - The validation parameters.
   * @param params.scope - The network scope.
   * @param params.fromAccountId - The account ID to send from.
   * @param params.toAddress - The recipient address.
   * @param params.asset - The asset being sent.
   * @param params.amount - The amount to send (in UI units, e.g., TRX not SUN).
   * @returns A validation result indicating if the send can proceed.
   */
  async validateSend({
    scope,
    fromAccountId,
    toAddress,
    asset,
    amount,
  }: {
    scope: Network;
    fromAccountId: string;
    toAddress: string;
    asset: AssetEntity;
    amount: BigNumber;
  }): Promise<SendValidationResult> {
    this.#logger.log('Validating send', {
      scope,
      fromAccountId,
      toAddress,
      assetType: asset.assetType,
      amount: amount.toString(),
    });

    const nativeTokenId = Networks[scope].nativeToken.id;
    const isNativeToken = asset.assetType === nativeTokenId;

    /**
     * Get the user's current balances for the asset being sent and TRX (for fees).
     */
    const [assetBalance, nativeTokenAsset, bandwidthAsset, energyAsset] =
      await this.#assetsService.getAssetsByAccountId(fromAccountId, [
        asset.assetType,
        nativeTokenId,
        Networks[scope].bandwidth.id,
        Networks[scope].energy.id,
      ]);

    const assetToSendBalance = assetBalance
      ? new BigNumber(assetBalance.uiAmount)
      : ZERO;
    const nativeTokenBalance = nativeTokenAsset
      ? new BigNumber(nativeTokenAsset.uiAmount)
      : ZERO;
    const availableBandwidth = bandwidthAsset
      ? new BigNumber(bandwidthAsset.rawAmount)
      : ZERO;
    const availableEnergy = energyAsset
      ? new BigNumber(energyAsset.rawAmount)
      : ZERO;

    /**
     * First check: Does the user have enough of the asset they want to send?
     */
    if (amount.isGreaterThan(assetToSendBalance)) {
      this.#logger.log('Insufficient balance for asset being sent', {
        amount: amount.toString(),
        assetBalance: assetToSendBalance.toString(),
      });
      return {
        valid: false,
        errorCode: SendErrorCodes.InsufficientBalance,
      };
    }

    /**
     * Build the transaction with the ACTUAL toAddress to properly calculate
     * account activation fees if the recipient is not yet activated.
     */
    const transaction = await this.buildTransaction({
      fromAccountId,
      toAddress,
      asset,
      amount: amount.toNumber(),
    });

    /**
     * Calculate the fees including:
     * - Bandwidth costs (or TRX if insufficient bandwidth)
     * - Energy costs (or TRX if insufficient energy)
     * - Account activation fee (1 TRX if recipient is not activated)
     */
    const fees = await this.#feeCalculatorService.computeFee({
      scope,
      transaction,
      availableEnergy,
      availableBandwidth,
    });

    /**
     * Extract the TRX fee from the computed fees.
     * The fee calculation already accounts for bandwidth/energy consumption,
     * so we only need to check the TRX overage cost.
     */
    const trxFee = new BigNumber(
      fees.find((fee) => fee.asset.type === nativeTokenId)?.asset.amount ?? '0',
    );

    /**
     * Calculate total TRX needed:
     * - If sending TRX: amount + fees
     * - If sending a token: just fees (but we still need TRX to pay them)
     */
    const totalTrxNeeded = isNativeToken ? amount.plus(trxFee) : trxFee;

    this.#logger.log('Validation calculation', {
      isNativeToken,
      amount: amount.toString(),
      trxFee: trxFee.toString(),
      totalTrxNeeded: totalTrxNeeded.toString(),
      nativeTokenBalance: nativeTokenBalance.toString(),
    });

    /**
     * Second check: Does the user have enough TRX to cover the total cost?
     */
    if (totalTrxNeeded.isGreaterThan(nativeTokenBalance)) {
      this.#logger.log('Insufficient TRX balance to cover fees', {
        totalTrxNeeded: totalTrxNeeded.toString(),
        nativeTokenBalance: nativeTokenBalance.toString(),
      });
      return {
        valid: false,
        errorCode: SendErrorCodes.InsufficientBalanceToCoverFee,
      };
    }

    return { valid: true };
  }

  async buildTransaction({
    fromAccountId,
    toAddress,
    asset,
    amount,
  }: {
    fromAccountId: string;
    toAddress: string;
    asset: AssetEntity;
    amount: number;
  }): Promise<
    | Transaction<TransferContract>
    | Transaction<TransferAssetContract>
    | Transaction<TriggerSmartContract>
  > {
    const { chainId, assetNamespace, assetReference } = parseCaipAssetType(
      asset.assetType,
    );

    try {
      switch (assetNamespace) {
        case 'slip44':
          this.#logger.log('Sending TRX transaction');
          return this.buildSendTrxTransaction({
            scope: chainId as Network,
            fromAccountId,
            toAddress,
            amount,
          });

        case 'trc10':
          this.#logger.log(`Sending TRC10 token: ${assetReference}`);
          return this.buildSendTrc10Transaction({
            scope: chainId as Network,
            fromAccountId,
            toAddress,
            amount,
            tokenId: assetReference,
            decimals: asset.decimals,
          });

        case 'trc20':
          this.#logger.log(`Sending TRC20 token: ${assetReference}`);
          return this.buildSendTrc20Transaction({
            scope: chainId as Network,
            fromAccountId,
            toAddress,
            contractAddress: assetReference,
            amount,
            decimals: asset.decimals,
          });

        default:
          throw new Error(`Unsupported asset namespace: ${assetNamespace}`);
      }
    } catch (error) {
      this.#logger.error({ error }, 'Failed to send asset');
      throw new Error(
        `Failed to send asset: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async buildSendTrxTransaction({
    scope,
    fromAccountId,
    toAddress,
    amount,
  }: {
    scope: Network;
    fromAccountId: string;
    toAddress: string;
    amount: number;
  }): Promise<Transaction<TransferContract>> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const tronWeb = this.#tronWebFactory.createClient(scope);

    const amountInSun = Number(trxToSun(amount));
    return tronWeb.transactionBuilder.sendTrx(
      toAddress,
      amountInSun,
      account.address,
    );
  }

  async buildSendTrc10Transaction({
    scope,
    fromAccountId,
    toAddress,
    amount,
    tokenId,
    decimals,
  }: {
    scope: Network;
    fromAccountId: string;
    toAddress: string;
    amount: number;
    tokenId: string;
    decimals: number;
  }): Promise<Transaction<TransferAssetContract>> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const tronWeb = this.#tronWebFactory.createClient(scope);

    const rawAmount = Number(toRawAmount(amount, decimals));

    return tronWeb.transactionBuilder.sendToken(
      toAddress,
      rawAmount,
      tokenId,
      account.address,
    );
  }

  async buildSendTrc20Transaction({
    scope,
    fromAccountId,
    toAddress,
    contractAddress,
    amount,
    decimals,
  }: {
    scope: Network;
    fromAccountId: string;
    toAddress: string;
    contractAddress: string;
    amount: number;
    decimals: number;
  }): Promise<Transaction<TriggerSmartContract>> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const tronWeb = this.#tronWebFactory.createClient(scope);

    const functionSelector = 'transfer(address,uint256)';
    const decimalsAdjustedAmount = toRawAmount(amount, decimals);
    const parameter = [
      { type: 'address', value: toAddress },
      { type: 'uint256', value: decimalsAdjustedAmount },
    ];

    const contractResult =
      await tronWeb.transactionBuilder.triggerSmartContract(
        contractAddress,
        functionSelector,
        {},
        parameter,
        account.address,
      );

    return contractResult.transaction;
  }

  /**
   * Extracts the owner address (sender) from a transaction.
   * The owner_address is stored in hex format in the transaction's raw_data.
   *
   * @param transaction - The transaction to extract the owner address from.
   * @returns The owner address in base58 format, or null if not found.
   */
  #extractTransactionOwnerAddress(
    transaction:
      | Transaction<TransferContract>
      | Transaction<TransferAssetContract>
      | Transaction<TriggerSmartContract>,
  ): string | null {
    const contract = transaction.raw_data?.contract?.[0];
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerAddressHex = (contract?.parameter?.value as any)?.owner_address;

    if (!ownerAddressHex) {
      return null;
    }

    try {
      return TronWeb.address.fromHex(ownerAddressHex);
    } catch {
      return null;
    }
  }

  async signAndSendTransaction({
    scope,
    fromAccountId,
    transaction,
    origin = 'MetaMask',
  }: {
    scope: Network;
    fromAccountId: string;
    transaction:
      | Transaction<TransferContract>
      | Transaction<TransferAssetContract>
      | Transaction<TriggerSmartContract>;
    origin?: string;
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<BroadcastReturn<any>> {
    /**
     * Validate that the fromAccountId resolves to a snap-managed account
     * and that its address matches the transaction's owner_address.
     */
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const transactionOwnerAddress =
      this.#extractTransactionOwnerAddress(transaction);

    if (!transactionOwnerAddress) {
      throw new Error(
        'Transaction is missing owner_address - cannot verify sender',
      );
    }

    if (transactionOwnerAddress !== account.address) {
      throw new Error(
        `Transaction owner_address (${transactionOwnerAddress}) does not match the account address (${account.address})`,
      );
    }

    /**
     * Derive the private key for signing
     */
    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    /**
     * Sign and send the transaction atomically after user confirmation
     */
    const signedTransaction = await tronWeb.trx.sign(transaction);
    const result = await tronWeb.trx.sendRawTransaction(signedTransaction);

    if (!result.result) {
      throw new Error(`Failed to send transaction: ${result.message}`);
    }

    await this.#snapClient.trackTransactionSubmitted({
      origin,
      accountType: account.type,
      chainIdCaip: scope,
    });

    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.TrackTransaction,
      params: {
        txId: result.txid,
        scope,
        accountIds: [fromAccountId],
        attempt: 0,
      },
      duration: 'PT1S',
    });

    return result;
  }
}
