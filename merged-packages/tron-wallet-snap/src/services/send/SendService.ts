import { parseCaipAssetType } from '@metamask/utils';
import type {
  BroadcastReturn,
  Transaction,
  TransferAssetContract,
  TransferContract,
  TriggerSmartContract,
} from 'tronweb/lib/esm/types';

import type { TransactionResult } from './types';
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
  }): Promise<any> {
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

    return transaction;
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
    return transaction;
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

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    const functionSelector = 'transfer(address,uint256)';
    const decimalsAdjustedAmount = amount * 10 ** decimals;
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

    return contractResult.transaction;
  }

  async signAndSendTransaction({
    scope,
    fromAccountId,
    transaction,
  }: {
    scope: Network;
    fromAccountId: string;
    transaction:
      | Transaction<TransferContract>
      | Transaction<TransferAssetContract>
      | Transaction<TriggerSmartContract>;
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
    const signedTx = await tronWeb.trx.sign(transaction);
    const result = await tronWeb.trx.sendRawTransaction(signedTx);

    return result;
  }

  async sendAsset({
    fromAccountId,
    toAddress,
    asset,
    amount,
  }: {
    fromAccountId: string;
    toAddress: string;
    asset: AssetEntity;
    amount: number;
  }): Promise<TransactionResult> {
    const { chainId, assetNamespace, assetReference } = parseCaipAssetType(
      asset.assetType,
    );

    try {
      switch (assetNamespace) {
        case 'slip44':
          this.#logger.log('Sending TRX transaction');
          return this.sendTrx({
            scope: chainId as Network,
            fromAccountId,
            toAddress,
            amount,
          });

        case 'trc10':
          this.#logger.log(`Sending TRC10 token: ${assetReference}`);
          return this.sendTrc10({
            scope: chainId as Network,
            fromAccountId,
            toAddress,
            amount,
            tokenId: assetReference,
          });

        case 'trc20':
          this.#logger.log(`Sending TRC20 token: ${assetReference}`);
          return this.sendTrc20({
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

  async sendTrx({
    scope,
    fromAccountId,
    toAddress,
    amount,
  }: {
    scope: Network;
    fromAccountId: string;
    toAddress: string;
    amount: number;
  }): Promise<TransactionResult> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    try {
      const amountInSun = amount * 1e6; // Convert TRX to sun
      const transaction = await tronWeb.transactionBuilder.sendTrx(
        toAddress,
        amountInSun,
      );
      const signedTx = await tronWeb.trx.sign(transaction);
      const result = await tronWeb.trx.sendRawTransaction(signedTx);

      if (!result.result) {
        throw new Error(
          `Transaction failed: ${result.message || 'Unknown error'}`,
        );
      }

      this.#logger.log(
        { txId: result.txid },
        'TRX transaction sent successfully',
      );

      /**
       * Check if the transaction's destination address is also managed by the snap.
       * If so, sync the account. Otherwise, only sync the source account.
       */
      const accountIdsToSync = [fromAccountId];

      const destinationAccount =
        await this.#accountsService.findByAddress(toAddress);

      if (destinationAccount) {
        accountIdsToSync.push(destinationAccount.id);
      }

      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.SynchronizeAccounts,
        params: { accountIds: accountIdsToSync },
        duration: 'PT5S', // Wait 5 seconds before syncing to allow transaction to be processed
      });

      return {
        success: true,
        txId: result.txid,
        transaction: signedTx,
      };
    } catch (error) {
      this.#logger.error({ error }, 'Failed to send TRX');
      throw new Error(
        `Failed to send TRX: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async sendTrc10({
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
  }): Promise<TransactionResult> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    try {
      const transaction = await tronWeb.transactionBuilder.sendToken(
        toAddress,
        amount,
        tokenId,
      );
      const signedTx = await tronWeb.trx.sign(transaction);
      const result = await tronWeb.trx.sendRawTransaction(signedTx);

      if (!result.result) {
        throw new Error(
          `Transaction failed: ${result.message || 'Unknown error'}`,
        );
      }

      this.#logger.log(
        { txId: result.txid },
        'TRC10 transaction sent successfully',
      );

      /**
       * Check if the transaction's destination address is also managed by the snap.
       * If so, sync the account. Otherwise, only sync the source account.
       */
      const accountIdsToSync = [fromAccountId];

      const destinationAccount =
        await this.#accountsService.findByAddress(toAddress);

      if (destinationAccount) {
        accountIdsToSync.push(destinationAccount.id);
      }

      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.SynchronizeAccounts,
        params: { accountIds: accountIdsToSync },
        duration: 'PT5S', // Wait 5 seconds before syncing to allow transaction to be processed
      });

      return {
        success: true,
        txId: result.txid,
        transaction: signedTx,
      };
    } catch (error) {
      this.#logger.error({ error }, 'Failed to send TRC10');
      throw new Error(
        `Failed to send TRC10: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async sendTrc20({
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
  }): Promise<TransactionResult> {
    const account = await this.#accountsService.findByIdOrThrow(fromAccountId);

    const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    try {
      const functionSelector = 'transfer(address,uint256)';
      const decimalsAdjustedAmount = amount * 10 ** decimals;
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

      if (!contractResult.result?.result) {
        throw new Error('Failed to create TRC20 transaction');
      }

      const signedTx = await tronWeb.trx.sign(contractResult.transaction);
      const result = await tronWeb.trx.sendRawTransaction(signedTx);

      if (!result.result) {
        throw new Error(
          `Transaction failed: ${result.message || 'Unknown error'}`,
        );
      }

      this.#logger.log(
        { txId: result.txid },
        'TRC20 transaction sent successfully',
      );

      /**
       * Check if the transaction's destination address is also managed by the snap.
       * If so, sync the account. Otherwise, only sync the source account.
       */
      const accountIdsToSync = [fromAccountId];

      const destinationAccount =
        await this.#accountsService.findByAddress(toAddress);

      if (destinationAccount) {
        accountIdsToSync.push(destinationAccount.id);
      }

      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.SynchronizeAccounts,
        params: { accountIds: accountIdsToSync },
        duration: 'PT5S', // Wait 5 seconds before syncing to allow transaction to be processed
      });

      return {
        success: true,
        txId: result.txid,
        transaction: signedTx,
      };
    } catch (error) {
      this.#logger.error({ error }, 'Failed to send TRC20');
      throw new Error(
        `Failed to send TRC20: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
