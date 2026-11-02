import { TransactionStatus, TransactionType } from '@metamask/keyring-api';
import type { Transaction } from '@metamask/keyring-api';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

/**
 * One leg of a transaction's user-facing effect: an asset moving from or to
 * an address. Amounts are human-readable (e.g. `1.5`).
 */
export type PendingTransactionMovement = {
  /** Address giving or receiving the asset. */
  address: string;
  /** CAIP-19 ID of the asset moved. */
  assetId: CaipAssetType;
  /** Display unit of the asset. */
  unit: string;
  /** Human-readable amount moved. */
  amount: string;
};

/**
 * A snap-side classification of a transaction at broadcast time, before any
 * indexer or RPC history can describe it. Produced by each snap's own
 * chain-specific decoding; never accepted from clients, so a dApp cannot
 * dress up an arbitrary transaction.
 */
export type PendingTransactionClassification = {
  /** The classified transaction type. */
  type: TransactionType;
  /** Assets leaving the account. */
  from: PendingTransactionMovement[];
  /** Assets arriving (recipient, or the account itself for swaps). */
  to: PendingTransactionMovement[];
};

/**
 * Builds the keyring `Transaction` a snap saves and emits right after
 * broadcast, so clients can render a pending activity row before the chain
 * data catches up.
 *
 * With a classification, the row carries the real type, counterparties,
 * assets and amounts. Without one, it degrades to a native-asset placeholder
 * (zero amount, no recipient) that still deduplicates by id against the
 * confirmed transaction once indexed.
 *
 * All wallet snaps should build their submit-time pending transactions
 * through this helper so the four chains emit one consistent shape.
 *
 * @param params - The parameters.
 * @param params.id - The chain-specific transaction ID (signature or hash).
 * @param params.account - The account that initiated the transaction.
 * @param params.account.id - The keyring account ID (UUID).
 * @param params.account.address - The account's on-chain address.
 * @param params.scope - The CAIP-2 chain ID.
 * @param params.nativeAsset - The chain's native asset, used for the
 * placeholder when no classification is available.
 * @param params.nativeAsset.symbol - The native asset's display unit.
 * @param params.nativeAsset.assetId - The native asset's CAIP-19 ID.
 * @param params.classification - The snap-side classification, if the
 * transaction could be decoded.
 * @param params.type - Type used when no classification is available (e.g. a
 * flow classification resolved from swap/bridge hints). Defaults to
 * `unknown`.
 * @param params.status - The initial status. Defaults to `submitted`.
 * @returns A pending transaction in the keyring API format.
 */
export function buildPendingTransaction({
  id,
  account,
  scope,
  nativeAsset,
  classification,
  type,
  status = TransactionStatus.Submitted,
}: {
  id: string;
  account: { id: string; address: string };
  scope: CaipChainId;
  nativeAsset: { symbol: string; assetId: CaipAssetType };
  classification?: PendingTransactionClassification;
  type?: TransactionType;
  status?: TransactionStatus.Submitted | TransactionStatus.Unconfirmed;
}): Transaction {
  const timestamp = Math.floor(Date.now() / 1000);

  const toParticipant = (
    movement: PendingTransactionMovement,
  ): Transaction['from'][number] => ({
    address: movement.address,
    asset: {
      unit: movement.unit,
      type: movement.assetId,
      amount: movement.amount,
      fungible: true as const,
    },
  });

  return {
    id,
    account: account.id,
    chain: scope,
    status,
    type: classification?.type ?? type ?? TransactionType.Unknown,
    timestamp,
    from: classification
      ? classification.from.map(toParticipant)
      : [
          {
            address: account.address,
            asset: {
              unit: nativeAsset.symbol,
              type: nativeAsset.assetId,
              amount: '0',
              fungible: true as const,
            },
          },
        ],
    to: classification ? classification.to.map(toParticipant) : [],
    fees: [],
    events: [{ status, timestamp }],
  };
}
