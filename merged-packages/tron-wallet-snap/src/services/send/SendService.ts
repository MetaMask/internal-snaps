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

import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { BackgroundEventMethod } from '../../handlers/cronjob';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { AccountsService } from '../accounts/AccountsService';

export class SendService {
  readonly #accountsService: AccountsService;

  readonly #tronWebFactory: TronWebFactory;

  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  constructor({
    accountsService,
    tronWebFactory,
    logger,
    snapClient,
  }: {
    accountsService: AccountsService;
    tronWebFactory: TronWebFactory;
    logger: ILogger;
    snapClient: SnapClient;
  }) {
    this.#accountsService = accountsService;
    this.#tronWebFactory = tronWebFactory;
    this.#logger = createPrefixedLogger(logger, '[💸 SendService]');
    this.#snapClient = snapClient;
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

    const amountInSun = amount * 1e6; // Convert TRX to sun
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
  }: {
    scope: Network;
    fromAccountId: string;
    toAddress: string;
    amount: number;
    tokenId: string;
  }): Promise<Transaction<TransferAssetContract>> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const tronWeb = this.#tronWebFactory.createClient(scope);

    return tronWeb.transactionBuilder.sendToken(
      toAddress,
      amount,
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
    // Convert amount to the smallest unit using BigNumber to avoid precision loss
    // This is necessary for tokens with 18 decimals where numbers exceed JavaScript's safe integer range
    const decimalsAdjustedAmount = BigNumber(amount)
      .multipliedBy(BigNumber(10).pow(decimals))
      .toFixed(0);
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
