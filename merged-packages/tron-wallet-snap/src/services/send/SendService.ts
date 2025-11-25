import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import type {
  BroadcastReturn,
  SignedTransaction,
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
    | (SignedTransaction & Transaction<TransferContract>)
    | (SignedTransaction & Transaction<TransferAssetContract>)
    | (SignedTransaction & Transaction<TriggerSmartContract>)
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
  }): Promise<SignedTransaction & Transaction<TransferContract>> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    const amountInSun = amount * 1e6; // Convert TRX to sun
    const transaction = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      amountInSun,
    );
    const signedTransaction = await tronWeb.trx.sign(transaction);

    return signedTransaction;
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
  }): Promise<SignedTransaction & Transaction<TransferAssetContract>> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    const transaction = await tronWeb.transactionBuilder.sendToken(
      toAddress,
      amount,
      tokenId,
    );
    const signedTransaction = await tronWeb.trx.sign(transaction);

    return signedTransaction;
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
  }): Promise<SignedTransaction & Transaction<TriggerSmartContract>> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

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
      );
    const signedTransaction = await tronWeb.trx.sign(
      contractResult.transaction,
    );

    return signedTransaction;
  }

  async sendTransaction({
    scope,
    fromAccountId,
    transaction,
    origin = 'MetaMask',
  }: {
    scope: Network;
    fromAccountId: string;
    transaction:
      | (SignedTransaction & Transaction<TransferContract>)
      | (SignedTransaction & Transaction<TransferAssetContract>)
      | (SignedTransaction & Transaction<TriggerSmartContract>);
    origin?: string;
  }): Promise<BroadcastReturn<any>> {
    /**
     * Initialize TronWeb client with the account's private key
     */
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);
    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    /**
     * Sign and send the transaction
     */
    const result = await tronWeb.trx.sendRawTransaction(transaction);

    // Track Transaction Submitted event if broadcast was successful
    if (result.result) {
      await this.#snapClient.trackTransactionSubmitted({
        origin,
        accountType: account.type,
        chainIdCaip: scope,
      });

      // Schedule transaction tracking to monitor confirmation status
      // The tracking job will fetch full details and update the transaction
      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.TrackTransaction,
        params: {
          txId: result.txid,
          scope,
          accountIds: [fromAccountId],
          attempt: 0,
        },
        duration: 'PT1S', // Start tracking after 1 second
      });
    }

    return result;
  }
}
