import type { Transaction } from '@metamask/keyring-api';
import type { Address, Signature } from '@solana/kit';

import type {
  AssetEntity,
  SolanaKeyringAccount,
  Subscription,
} from '../../../entities';

export type UnencryptedStateValue = {
  keyringAccounts: Record<string, SolanaKeyringAccount>;
  mapInterfaceNameToId: Record<string, string>;
  transactions: Record<string, Transaction[]>;
  // we need to store the exhaustive list of signatures (including spam)
  // to keep track of the transactions per account. The field transactions above only stores non-spam transactions, which break the refreshAccounts cronjob logic.
  signatures: Record<Address, Signature[]>;
  assetEntities: Record<string, AssetEntity[]>;
  subscriptions: Record<string, Subscription>;
  webSocketConnections: {
    closeWebSocketConnectionsBackgroundEventId: string | null;
  };
};

export const DEFAULT_UNENCRYPTED_STATE: UnencryptedStateValue = {
  keyringAccounts: {},
  mapInterfaceNameToId: {},
  transactions: {},
  signatures: {},
  assetEntities: {},
  subscriptions: {},
  webSocketConnections: {
    closeWebSocketConnectionsBackgroundEventId: null,
  },
};
