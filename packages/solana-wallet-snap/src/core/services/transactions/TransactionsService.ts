import { KeyringEvent } from '@metamask/keyring-api';
import type { Transaction } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import { findAssociatedTokenPda } from '@solana-program/token';
import type { Address, Commitment, Signature, Slot } from '@solana/kit';
import { address as asAddress, signature as asSignature } from '@solana/kit';
import { get, groupBy } from 'lodash';

import type { AssetEntity, NativeAsset, TokenAsset } from '../../../entities';
import type { SolanaKeyringAccount } from '../../../entities/keyring-account';
import type { Network } from '../../constants/solana';
import type { SolanaTransaction } from '../../types/solana';
import { trackError } from '../../utils/errors';
import { tokenAddressToCaip19 } from '../../utils/tokenAddressToCaip19';
import type { AccountsService } from '../accounts';
import type { AssetsService } from '../assets/AssetsService';
import type { SolanaConnection } from '../connection';
import type { TransactionMapper } from './TransactionMapper';
import type { TransactionsRepository } from './TransactionsRepository';
import { isSpam } from './utils/isSpam';

export class TransactionsService {
  readonly #transactionsRepository: TransactionsRepository;

  readonly #transactionMapper: TransactionMapper;

  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #connection: SolanaConnection;

  constructor(
    transactionsRepository: TransactionsRepository,
    transactionMapper: TransactionMapper,
    accountsService: AccountsService,
    assetsService: AssetsService,
    connection: SolanaConnection,
  ) {
    this.#transactionsRepository = transactionsRepository;
    this.#transactionMapper = transactionMapper;
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#connection = connection;
  }

  async fetchBySignature(
    signature: string,
    account: SolanaKeyringAccount,
    scope: Network,
  ): Promise<Transaction | null> {
    const transactionData = await this.#connection
      .getRpc(scope)
      .getTransaction(asSignature(signature), {
        maxSupportedTransactionVersion: 0,
      })
      .send();

    if (!transactionData) {
      return null;
    }

    return this.#transactionMapper.mapRpcTransaction(
      transactionData,
      account,
      scope,
    );
  }

  /**
   * Fetches the transactions for the given assets.
   * Only fetches the transactions that are not already in the state.
   *
   * @param assets - The assets to fetch the transactions for.
   * @param options - The options for the fetch.
   * @param options.limit - The maximum number of transactions to fetch.
   * @returns The transactions for the given assets.
   */
  async fetchAssetsTransactions(
    assets: AssetEntity[],
    options?: {
      limit?: number;
    },
  ): Promise<Transaction[]> {
    const assetTypes = assets.map((asset) => asset.assetType);

    // Start all independent requests before awaiting any of them. Core token
    // assets can then resolve their token account while the saved history is
    // still being loaded.
    const accountsPromise = this.#accountsService.getAll();
    const assetsMetadataPromise =
      this.#assetsService.getAssetsMetadata(assetTypes);
    const savedTransactionsPromise = this.#transactionsRepository.getAll();

    const accounts = await accountsPromise;

    const findAccountById = (id: string) =>
      accounts.find((account) => account.id === id);

    const findLatestTransactionForAsset = async (asset: AssetEntity) => {
      const savedTransactions = await savedTransactionsPromise;
      const { network } = asset;
      const addressOrMint = asset.assetType.endsWith('/slip44:501')
        ? (asset as NativeAsset).address
        : (asset as TokenAsset).mint;

      const existingTransaction = savedTransactions
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
        .find(
          (tx) =>
            tx.from.some(
              (from) =>
                tokenAddressToCaip19(network, addressOrMint) ===
                get(from, 'asset.type'),
            ) ||
            tx.to.some(
              (to) =>
                tokenAddressToCaip19(network, addressOrMint) ===
                get(to, 'asset.type'),
            ),
        );

      if (!existingTransaction) {
        return null;
      }

      return existingTransaction;
    };

    type SignatureWithAsset = {
      signatureResponse: {
        signature: Signature;
        blockTime: number;
      };
      asset: AssetEntity;
    };

    const fetchSignaturesForAsset = async (
      asset: AssetEntity,
    ): Promise<SignatureWithAsset[]> => {
      const { network } = asset;
      const account = findAccountById(asset.keyringAccountId);

      // The address lookup and local history lookup are independent. This is
      // especially important for Core assets, where resolving the token
      // account may require a mint RPC request.
      const [addressOrPubkey, latestTransaction] = await Promise.all([
        this.#resolveAssetAddress(asset, account?.address),
        findLatestTransactionForAsset(asset),
      ]);

      if (!addressOrPubkey) {
        return [];
      }

      const latestSignature = latestTransaction
        ? asSignature(latestTransaction.id)
        : undefined;

      const response = await this.#connection
        .getRpc(network)
        .getSignaturesForAddress(addressOrPubkey, {
          limit: 5,
          ...(latestSignature ? { until: latestSignature } : {}),
        })
        .send();

      return response.map((item) => ({
        signatureResponse: {
          signature: item.signature,
          blockTime: Number(item.blockTime ?? 0),
        },
        asset,
      }));
    };

    const signatures = (
      await Promise.all(assets.map(fetchSignaturesForAsset))
    ).flat();

    // If limit is provided, only fetch the most recent signatures with the limit
    const signaturesToFetch = options?.limit
      ? signatures
          .sort(
            (a, b) =>
              (b.signatureResponse.blockTime ?? 0) -
              (a.signatureResponse.blockTime ?? 0),
          )
          .slice(0, options.limit)
      : signatures;

    type TransactionWithAsset = {
      transaction: SolanaTransaction | null;
      asset: AssetEntity;
    };

    const fetchTransaction = async (
      signatureWithAsset: SignatureWithAsset,
    ): Promise<TransactionWithAsset | null> => {
      try {
        const { signatureResponse, asset } = signatureWithAsset;
        const transaction = await this.#connection
          .getRpc(asset.network)
          .getTransaction(asSignature(signatureResponse.signature), {
            maxSupportedTransactionVersion: 0,
          })
          .send();
        return {
          transaction,
          asset,
        };
      } catch (error) {
        await trackError(error);
        return null;
      }
    };

    const transactions = (
      await Promise.all(signaturesToFetch.map(fetchTransaction))
    ).filter((item) => item !== null);

    const assetsMetadata = await assetsMetadataPromise;

    const mapTransaction = async (
      transactionWithAsset: TransactionWithAsset,
    ) => {
      const { transaction, asset } = transactionWithAsset;
      if (!transaction) {
        return null;
      }
      const account = findAccountById(asset.keyringAccountId);
      if (!account) {
        return null;
      }
      return this.#transactionMapper.mapRpcTransaction(
        transaction,
        account,
        asset.network,
        assetsMetadata,
      );
    };

    const mappedTransactions = (
      await Promise.all(transactions.map(mapTransaction))
    )
      .filter((item) => item !== null)
      .filter((item) => {
        const account = findAccountById(item.account);
        if (!account) {
          return false;
        }
        return !isSpam(item, account);
      });

    return mappedTransactions;
  }

  async #resolveAssetAddress(
    asset: AssetEntity,
    accountAddress?: string,
  ): Promise<Address | null> {
    if (asset.assetType.endsWith('/slip44:501')) {
      return asAddress((asset as NativeAsset).address);
    }

    const tokenAsset = asset as TokenAsset;
    if (tokenAsset.pubkey) {
      return asAddress(tokenAsset.pubkey);
    }

    if (!accountAddress) {
      return null;
    }

    try {
      const mintAccount = await this.#connection.fetchMint(
        tokenAsset.mint,
        asset.network,
      );
      const [associatedTokenAccount] = await findAssociatedTokenPda({
        mint: asAddress(tokenAsset.mint),
        owner: asAddress(accountAddress),
        tokenProgram: mintAccount.programAddress,
      });

      return associatedTokenAccount;
    } catch (error) {
      await trackError(error);
      return null;
    }
  }

  async fetchLatestSignatures(
    scope: Network,
    address: Address,
    config?: {
      /** start searching backwards from this transaction signature. If not provided the search starts from the top of the highest max confirmed block. */
      before?: Signature;
      commitment?: Exclude<Commitment, 'processed'>;
      /** maximum transaction signatures to return (between 1 and 1,000). Default: 1000 */
      limit?: number;
      /** The minimum slot that the request can be evaluated at */
      minContextSlot?: Slot;
      /** search until this transaction signature, if found before limit reached */
      until?: Signature;
    },
  ): Promise<Signature[]> {
    const signatureResponses = await this.#connection
      .getRpc(scope)
      .getSignaturesForAddress(address, config)
      .send();
    const signatures = signatureResponses.map(({ signature }) => signature);

    return signatures;
  }

  async findByAccounts(
    accounts: SolanaKeyringAccount[],
  ): Promise<Transaction[]> {
    const transactions = await Promise.all(
      accounts.map(async (account) =>
        this.#transactionsRepository.findByAccountId(account.id),
      ),
    );

    return transactions.flat();
  }

  async save(transaction: Transaction): Promise<void> {
    await this.saveMany([transaction]);
  }

  async saveMany(transactions: Transaction[]): Promise<void> {
    await this.#transactionsRepository.saveMany(transactions);

    const transactionsByAccountId = groupBy(transactions, 'account');

    await emitSnapKeyringEvent(snap, KeyringEvent.AccountTransactionsUpdated, {
      transactions: transactionsByAccountId,
    });
  }
}
