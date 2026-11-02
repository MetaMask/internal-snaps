import { TransactionType } from '@metamask/keyring-api';
import type { PendingTransactionClassification } from '@metamask/snap-networks-utils';
import type { PendingTransactionMovement } from '@metamask/snap-networks-utils';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import type { Logger } from '@metamask/snap-networks-utils';
import type { Address } from '@solana/kit';
import { BigNumber } from 'bignumber.js';

import { extractInstructionsFromUnknownBase64String } from '../../../entities';
import { Networks } from '../../constants/solana';
import type { Network } from '../../constants/solana';
import { lamportsToSol } from '../../utils/conversion';
import { tokenAddressToCaip19 } from '../../utils/tokenAddressToCaip19';
import type { AssetsService } from '../assets';
import type { SolanaConnection } from '../connection';

/**
 * Classifies a transaction at broadcast time by decoding its instructions,
 * so the optimistic pending activity row can carry the real type,
 * counterparties, assets and amounts before any indexer catches up.
 *
 * Only self-describing transfers are classified (system SOL transfers and
 * token `transferChecked` instructions). Anything else (swaps, arbitrary
 * program calls) returns `undefined` and the caller falls back to a
 * native-asset placeholder: those movements only exist in post-execution
 * inner instructions and cannot be known at submit time.
 */
export class PendingTransactionClassifier {
  readonly #connection: SolanaConnection;

  readonly #assetsService: AssetsService;

  readonly #logger: Logger;

  constructor(
    connection: SolanaConnection,
    assetsService: AssetsService,
    logger: Logger,
  ) {
    this.#connection = connection;
    this.#assetsService = assetsService;
    this.#logger = logger.withPrefix('[🔎 PendingTransactionClassifier]');
  }

  /**
   * Classifies a base64-encoded transaction or transaction message.
   *
   * @param base64Transaction - The transaction being broadcast.
   * @param account - The account sending the transaction.
   * @param scope - The network scope.
   * @returns The classification, or `undefined` when the transaction is not a
   * self-describing transfer.
   */
  async classify(
    base64Transaction: string,
    account: ExtendedKeyringAccount,
    scope: Network,
  ): Promise<PendingTransactionClassification | undefined> {
    const instructions = await extractInstructionsFromUnknownBase64String(
      this.#connection.getRpc(scope),
      base64Transaction,
    );

    const from: PendingTransactionMovement[] = [];
    const to: PendingTransactionMovement[] = [];

    for (const instruction of instructions) {
      if (!instruction.parsed) {
        continue;
      }

      const { accounts = {}, data } = instruction.parsed;

      if (
        instruction.type === 'TransferSol' ||
        instruction.type === 'TransferSolWithSeed'
      ) {
        const movement: PendingTransactionMovement = {
          address: '',
          assetId: Networks[scope].nativeToken.caip19Id,
          unit: Networks[scope].nativeToken.symbol,
          amount: lamportsToSol(data.amount as bigint).toString(),
        };
        from.push({ ...movement, address: String(accounts.source?.address) });
        to.push({
          ...movement,
          address: String(accounts.destination?.address),
        });
        continue;
      }

      if (instruction.type === 'TransferChecked') {
        const mint = String(accounts.mint?.address);
        const assetId = tokenAddressToCaip19(scope, mint);
        const amount = BigNumber(String(data.amount)).div(
          BigNumber(10).pow(Number(data.decimals)),
        );
        const movement: PendingTransactionMovement = {
          address: '',
          assetId,
          unit: await this.#resolveUnit(account.id, assetId),
          amount: amount.toString(),
        };
        from.push({
          ...movement,
          address: String(accounts.authority?.address),
        });

        // The destination is a token account; resolve its owner so the row
        // shows the actual recipient.
        const owner = await this.#resolveTokenAccountOwner(
          scope,
          String(accounts.destination?.address),
        );
        if (owner) {
          to.push({ ...movement, address: owner });
        }
      }
    }

    if (from.length === 0) {
      return undefined;
    }

    return {
      type: TransactionType.Send,
      from,
      to,
    };
  }

  async #resolveUnit(
    accountId: string,
    assetId: ReturnType<typeof tokenAddressToCaip19>,
  ): Promise<string> {
    try {
      const assets = await this.#assetsService.getAccountAssetsByIDs(
        accountId,
        [assetId],
      );
      return assets[assetId]?.symbol ?? '';
    } catch (error) {
      this.#logger.warn('Failed to resolve asset unit', error);
      return '';
    }
  }

  async #resolveTokenAccountOwner(
    scope: Network,
    tokenAccount: string,
  ): Promise<string | undefined> {
    try {
      const response = await this.#connection
        .getRpc(scope)
        .getAccountInfo(tokenAccount as Address, { encoding: 'jsonParsed' })
        .send();
      const data = response.value?.data as unknown as {
        parsed?: { info?: { owner?: unknown } };
      };
      const owner = data?.parsed?.info?.owner;
      return typeof owner === 'string' ? owner : undefined;
    } catch (error) {
      this.#logger.warn('Failed to resolve token account owner', error);
      return undefined;
    }
  }
}
