import { parseCaipAssetType } from '@metamask/utils';

import type { TransactionResult } from './types';
import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { AccountsService } from '../accounts/AccountsService';

export class SendService {
  readonly #accountsService: AccountsService;

  readonly #tronWebFactory: TronWebFactory;

  readonly #logger: ILogger;

  constructor({
    accountsService,
    tronWebFactory,
    logger,
  }: {
    accountsService: AccountsService;
    tronWebFactory: TronWebFactory;
    logger: ILogger;
  }) {
    this.#accountsService = accountsService;
    this.#tronWebFactory = tronWebFactory;
    this.#logger = createPrefixedLogger(logger, '[💸 SendService]');
  }

  async sendAsset({
    fromAccountId,
    toAddress,
    amount,
    assetId,
  }: {
    fromAccountId: string;
    toAddress: string;
    amount: number;
    assetId: string;
  }): Promise<TransactionResult> {
    const { chainId, assetNamespace, assetReference } = parseCaipAssetType(
      assetId as `${string}:${string}/${string}:${string}`,
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
            amount,
            contractAddress: assetReference,
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
    const account = await this.#accountsService.findById(fromAccountId);

    if (!account) {
      throw new Error(`Account with ID ${fromAccountId} not found`);
    }

    const keypair = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    // eslint-disable-next-line no-restricted-globals
    const privateKeyHex = Buffer.from(keypair.privateKeyBytes).toString('hex');
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
    const account = await this.#accountsService.findById(fromAccountId);

    if (!account) {
      throw new Error(`Account with ID ${fromAccountId} not found`);
    }

    const keypair = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    // eslint-disable-next-line no-restricted-globals
    const privateKeyHex = Buffer.from(keypair.privateKeyBytes).toString('hex');
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
    amount,
    contractAddress,
  }: {
    scope: Network;
    fromAccountId: string;
    toAddress: string;
    amount: number;
    contractAddress: string;
  }): Promise<TransactionResult> {
    const account = await this.#accountsService.findById(fromAccountId);

    if (!account) {
      throw new Error(`Account with ID ${fromAccountId} not found`);
    }

    const keypair = await this.#accountsService.deriveTronKeypair({
      entropySource: account.entropySource,
      derivationPath: account.derivationPath,
    });

    // eslint-disable-next-line no-restricted-globals
    const privateKeyHex = Buffer.from(keypair.privateKeyBytes).toString('hex');
    const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

    try {
      const functionSelector = 'transfer(address,uint256)';
      const parameter = [
        { type: 'address', value: toAddress },
        { type: 'uint256', value: amount },
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
