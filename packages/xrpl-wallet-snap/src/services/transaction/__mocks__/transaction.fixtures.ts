import type { Transaction as KeyringTransaction } from '@metamask/keyring-api';
import { TransactionStatus, TransactionType } from '@metamask/keyring-api';

import type { KnownCaip19AssetIdOrSlip44Id } from '../../../api';
import { KnownCaip2ChainId } from '../../../api';
import { getSlip44AssetId } from '../../../utils';
import type { XrplKeyringTransaction } from '../api';

const sender = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const receiver = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

export type GenerateMockTransactionOverrides = Partial<{
  id: string;
  account: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: {
    type: KnownCaip19AssetIdOrSlip44Id;
    symbol: string;
  };
  scope: KnownCaip2ChainId;
  timestamp: number;
  status: TransactionStatus;
  type: TransactionType;
  fees: KeyringTransaction['fees'];
  events: KeyringTransaction['events'];
  reconcileAttemptCount: number;
}>;

/**
 * Builds keyring transactions for repository tests.
 *
 * @param count - How many transactions to build. Each one shares `overrides`.
 * @param overrides - Fields to set on every transaction.
 * @returns Snap-state transactions. Ids are unique when `overrides.id` is omitted.
 */
export function generateMockTransactions(
  count: number = 1,
  overrides: GenerateMockTransactionOverrides = {},
): XrplKeyringTransaction[] {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
    const status = overrides.status ?? TransactionStatus.Unconfirmed;
    const scope = overrides.scope ?? KnownCaip2ChainId.Mainnet;
    const assetType = overrides.asset?.type ?? getSlip44AssetId(scope);
    const assetSymbol = overrides.asset?.symbol ?? 'XRP';
    const amount = overrides.amount ?? '1000000';
    const id = overrides.id ?? `${index.toString(16).padStart(64, '0')}`;

    return {
      type: overrides.type ?? TransactionType.Send,
      id,
      from: [
        {
          address: overrides.fromAddress ?? sender,
          asset: {
            unit: assetSymbol,
            type: assetType,
            amount,
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: overrides.toAddress ?? receiver,
          asset: {
            unit: assetSymbol,
            type: assetType,
            amount,
            fungible: true,
          },
        },
      ],
      events: overrides.events ?? [{ status, timestamp }],
      chain: scope,
      status,
      account: overrides.account ?? 'account-1',
      timestamp,
      fees: overrides.fees ?? [],
      ...(overrides.reconcileAttemptCount === undefined
        ? {}
        : { reconcileAttemptCount: overrides.reconcileAttemptCount }),
    };
  });
}
