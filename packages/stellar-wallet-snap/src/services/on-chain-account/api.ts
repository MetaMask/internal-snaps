import type { KnownCaip2ChainId } from '../../api';
import type { OnChainAccountSerializableFull } from './OnChainAccountSerializable';

/** Per-asset entry: native, classic trustline (limit + issuer in `address`), or SEP-41. */
export type SpendableBalance = {
  balance: BigNumber;
  symbol: string;
  limit?: BigNumber;
  address?: string;
  authorized?: boolean;
  /** True when a non-empty Horizon `sponsor` is present (reserve sponsored by another account). */
  sponsored?: boolean;
  /** Horizon trustline `sponsor` account id when the reserve is sponsored. */
  sponsor?: string;
  decimals: number;
};

type KeyringAccountId = string;

/** `onChainAccounts[keyringAccountId][scope]` → last synced snapshot. */
export type OnChainAccountSnapshotsByKeyringId = Record<
  KeyringAccountId,
  Partial<Record<KnownCaip2ChainId, OnChainAccountSerializableFull>>
>;

/**
 * `unfundedOnChainAccounts[keyringAccountId][scope]` → when the network last confirmed that
 * the account does not exist (unfunded). Lets the keyring tell a confirmed-unfunded account
 * (balance 0) from one that was never synchronized (balance unknown).
 */
export type UnfundedOnChainAccountsByKeyringId = Record<
  KeyringAccountId,
  Partial<Record<KnownCaip2ChainId, number>>
>;

/**
 * Snap state slice for cached on-chain account snapshots (persisted under `onChainAccounts`).
 */
export type OnChainAccountState = {
  onChainAccounts: OnChainAccountSnapshotsByKeyringId;
  /** Optional: absent in states persisted before it was introduced. */
  unfundedOnChainAccounts?: UnfundedOnChainAccountsByKeyringId;
};
