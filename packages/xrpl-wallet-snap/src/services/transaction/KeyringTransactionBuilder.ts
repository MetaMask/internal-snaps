import {
  FeeType,
  TransactionStatus,
  TransactionType,
} from '@metamask/keyring-api';
import type { Transaction as KeyringTransaction } from '@metamask/keyring-api';

import type { KnownCaip2ChainId } from '../../api';
import type { KnownCaip19AssetIdOrSlip44Id } from '../../api/asset';
import { NATIVE_ASSET_SYMBOL } from '../../constants';
import { getSlip44AssetId, toDisplayBalance } from '../../utils';
import type { XrplKeyringAccount } from '../account/api';
import { KeyringTransactionBuilderException } from './exceptions';

export const KeyringTransactionType = {
  Swap: 'swap',
  BridgeSend: 'bridgeSend',
  ChangeTrustOptIn: 'changeTrustOptIn',
  ChangeTrustOptOut: 'changeTrustOptOut',
  ChangeMptOptIn: 'changeMptOptIn',
  ChangeMptOptOut: 'changeMptOptOut',
  Send: 'send',
  Pending: 'pending',
  Unknown: 'unknown',
} as const;

export type KeyringTransactionType =
  (typeof KeyringTransactionType)[keyof typeof KeyringTransactionType];

const KeyringTransactionTypeLabel = {
  ChangeTrustOptIn: 'trustline-approve',
  ChangeTrustOptOut: 'trustline-disapprove',
  ChangeMptOptIn: 'mpt-authorize',
  ChangeMptOptOut: 'mpt-unauthorize',
} as const;

export type KeyringTransactionAsset = {
  unit: string;
  type: KnownCaip19AssetIdOrSlip44Id;
  amount: string;
  fungible: true;
};

export type SendTransactionRequest = {
  txId: string;
  account: XrplKeyringAccount;
  scope: KnownCaip2ChainId;
  toAddress: string;
  asset: KeyringTransactionAsset;
  status?: TransactionStatus;
  timestamp?: KeyringTransaction['timestamp'];
  fees?: KeyringTransaction['fees'];
};

export type SwapTransactionRequest = {
  txId: string;
  account: XrplKeyringAccount;
  scope: KnownCaip2ChainId;
  toAddress: string;
  fromAsset: KeyringTransactionAsset;
  toAsset: KeyringTransactionAsset;
  status?: TransactionStatus;
  timestamp?: KeyringTransaction['timestamp'];
  fees?: KeyringTransaction['fees'];
};

export type ChangeTrustTransactionRequest = {
  txId: string;
  account: XrplKeyringAccount;
  scope: KnownCaip2ChainId;
  asset: KeyringTransactionAsset;
  status?: TransactionStatus;
  timestamp?: KeyringTransaction['timestamp'];
  fees?: KeyringTransaction['fees'];
};

export type ChangeMptOptTransactionRequest = ChangeTrustTransactionRequest;

export type PendingTransactionRequest = {
  txId: string;
  account: XrplKeyringAccount;
  scope: KnownCaip2ChainId;
  status?: TransactionStatus;
} & (
  | {
      transactionType?: TransactionType;
      asset: {
        type: KnownCaip19AssetIdOrSlip44Id;
        symbol: string;
      };
    }
  | {
      transactionType: TransactionType;
      from: KeyringTransaction['from'];
      to: KeyringTransaction['to'];
      fees?: KeyringTransaction['fees'];
    }
);

export type UnknownTransactionRequest = {
  txId: string;
  account: XrplKeyringAccount;
  transactionType?: TransactionType;
  scope: KnownCaip2ChainId;
  status?: TransactionStatus;
  from: KeyringTransaction['from'];
  to?: KeyringTransaction['to'];
  fees?: KeyringTransaction['fees'];
  timestamp?: KeyringTransaction['timestamp'];
};

export type KeyringTransactionRequest =
  | {
      type: typeof KeyringTransactionType.ChangeTrustOptIn;
      request: ChangeTrustTransactionRequest;
    }
  | {
      type: typeof KeyringTransactionType.ChangeTrustOptOut;
      request: ChangeTrustTransactionRequest;
    }
  | {
      type: typeof KeyringTransactionType.Send;
      request: SendTransactionRequest;
    }
  | {
      type: typeof KeyringTransactionType.Pending;
      request: PendingTransactionRequest;
    }
  | {
      type: typeof KeyringTransactionType.Unknown;
      request: UnknownTransactionRequest;
    }
  | {
      type: typeof KeyringTransactionType.Swap;
      request: SwapTransactionRequest;
    }
  | {
      type: typeof KeyringTransactionType.BridgeSend;
      request: UnknownTransactionRequest;
    };

export class KeyringTransactionBuilder {
  createTransaction(request: KeyringTransactionRequest): KeyringTransaction {
    switch (request.type) {
      case KeyringTransactionType.ChangeTrustOptOut:
      case KeyringTransactionType.ChangeTrustOptIn:
        return this.#createChangeTrustTransaction(
          request.request,
          request.type,
        );
      case KeyringTransactionType.ChangeMptOptIn:
      case KeyringTransactionType.ChangeMptOptOut:
        return this.#createChangeMptOptTransaction(
          request.request,
          request.type,
        );
      case KeyringTransactionType.Send:
        return this.#createSendTransaction(request.request);
      case KeyringTransactionType.Swap:
        return this.#createSwapTransaction(request.request);
      case KeyringTransactionType.Pending:
        return this.#createPendingTransaction(request.request);
      case KeyringTransactionType.Unknown:
      case KeyringTransactionType.BridgeSend:
        return this.#createUnknownTransaction(request.request);
      default:
        throw new KeyringTransactionBuilderException(
          `Invalid transaction type`,
        );
    }
  }

  /**
   * Builds a change-trust (trustline) keyring transaction.
   *
   * Maps opt-in to {@link TransactionType.TokenApprove} and opt-out to
   * {@link TransactionType.TokenDisapprove}. Sets `details.typeLabel` so the UI can
   * distinguish trustline approve vs disapprove until keyring types are fully adopted.
   *
   * @param request - Change-trust transaction fields (asset, fees, status, etc.).
   * @param optInOrOut - Whether this is a trustline opt-in or opt-out.
   * @returns A keyring transaction with token approve/disapprove type and UI type label.
   * @see {@link https://github.com/MetaMask/accounts/pull/568}
   */
  #createChangeTrustTransaction(
    request: ChangeTrustTransactionRequest,
    optInOrOut:
      | typeof KeyringTransactionType.ChangeTrustOptIn
      | typeof KeyringTransactionType.ChangeTrustOptOut,
  ): KeyringTransaction {
    const {
      txId,
      account,
      scope,
      asset,
      status = TransactionStatus.Unconfirmed,
    } = request;
    const timestamp = this.#resolveTimestamp(request.timestamp);
    const type =
      optInOrOut === KeyringTransactionType.ChangeTrustOptIn
        ? TransactionType.TokenApprove
        : TransactionType.TokenDisapprove;

    const typeLabel =
      optInOrOut === KeyringTransactionType.ChangeTrustOptIn
        ? KeyringTransactionTypeLabel.ChangeTrustOptIn
        : KeyringTransactionTypeLabel.ChangeTrustOptOut;

    return this.#buildKeyringTransaction({
      type,
      id: txId,
      account,
      scope,
      from: [{ address: account.address, asset }],
      to: [{ address: account.address, asset }],
      status,
      timestamp,
      fees: request.fees ?? [],
      details: {
        typeLabel,
      },
    });
  }

  /**
   * Builds an MPT authorize / unauthorize keyring transaction.
   *
   * Maps authorize to {@link TransactionType.TokenApprove} and unauthorize to
   * {@link TransactionType.TokenDisapprove}. Sets `details.typeLabel` so the UI
   * can distinguish MPT authorize vs unauthorize.
   *
   * @param request - MPT opt transaction fields (asset, fees, status, etc.).
   * @param optInOrOut - Whether this is an MPT authorize or unauthorize.
   * @returns A keyring transaction with token approve/disapprove type and UI type label.
   */
  #createChangeMptOptTransaction(
    request: ChangeMptOptTransactionRequest,
    optInOrOut:
      | typeof KeyringTransactionType.ChangeMptOptIn
      | typeof KeyringTransactionType.ChangeMptOptOut,
  ): KeyringTransaction {
    const {
      txId,
      account,
      scope,
      asset,
      status = TransactionStatus.Unconfirmed,
    } = request;
    const timestamp = this.#resolveTimestamp(request.timestamp);
    const type =
      optInOrOut === KeyringTransactionType.ChangeMptOptIn
        ? TransactionType.TokenApprove
        : TransactionType.TokenDisapprove;

    const typeLabel =
      optInOrOut === KeyringTransactionType.ChangeMptOptIn
        ? KeyringTransactionTypeLabel.ChangeMptOptIn
        : KeyringTransactionTypeLabel.ChangeMptOptOut;

    return this.#buildKeyringTransaction({
      type,
      id: txId,
      account,
      scope,
      from: [{ address: account.address, asset }],
      to: [{ address: account.address, asset }],
      status,
      timestamp,
      fees: request.fees ?? [],
      details: {
        typeLabel,
      },
    });
  }

  #createUnknownTransaction(
    request: UnknownTransactionRequest,
  ): KeyringTransaction {
    const {
      fees = [],
      txId,
      account,
      scope,
      transactionType = TransactionType.Unknown,
      from = [],
      to = [],
      status = TransactionStatus.Unconfirmed,
    } = request;
    const timestamp = this.#resolveTimestamp(request.timestamp);

    return this.#buildKeyringTransaction({
      type: transactionType,
      id: txId,
      account,
      scope,
      from,
      to,
      status,
      timestamp,
      fees,
    });
  }

  #createPendingTransaction(
    request: PendingTransactionRequest,
  ): KeyringTransaction {
    const timestamp = this.getCreateTime();
    const { txId, account, scope } = request;
    const status = request.status ?? TransactionStatus.Unconfirmed;

    // if the request has from and to, it is a pending classic swap transaction
    if ('from' in request) {
      return this.#buildKeyringTransaction({
        type: request.transactionType,
        id: txId,
        account,
        scope,
        from: request.from,
        to: request.to,
        status,
        timestamp,
        fees: request.fees ?? [],
      });
    }

    const { asset } = request;

    return this.#buildKeyringTransaction({
      type: request.transactionType ?? TransactionType.Unknown,
      id: txId,
      account,
      scope,
      from: [
        {
          address: account.address,
          asset: {
            unit: asset.symbol,
            type: asset.type,
            amount: '0',
            fungible: true,
          },
        },
      ],
      to: [
        {
          address: account.address,
          asset: {
            unit: asset.symbol,
            type: asset.type,
            amount: '0',
            fungible: true,
          },
        },
      ],
      status,
      timestamp,
      fees: [],
    });
  }

  #createSendTransaction(request: SendTransactionRequest): KeyringTransaction {
    const { txId, account, scope, toAddress, asset, fees = [] } = request;
    const status = request.status ?? TransactionStatus.Unconfirmed;
    const timestamp = this.#resolveTimestamp(request.timestamp);

    return this.#buildKeyringTransaction({
      type: TransactionType.Send,
      id: txId,
      account,
      scope,
      from: [{ address: account.address, asset }],
      to: [{ address: toAddress, asset }],
      status,
      timestamp,
      fees,
    });
  }

  #createSwapTransaction(request: SwapTransactionRequest): KeyringTransaction {
    const {
      txId,
      account,
      scope,
      toAddress,
      fromAsset,
      toAsset,
      fees = [],
    } = request;
    const status = request.status ?? TransactionStatus.Unconfirmed;
    const timestamp = this.#resolveTimestamp(request.timestamp);

    return this.#buildKeyringTransaction({
      type: TransactionType.Swap,
      id: txId,
      account,
      scope,
      from: [
        {
          address: account.address,
          asset: fromAsset,
        },
      ],
      to: [
        {
          address: toAddress,
          asset: toAsset,
        },
      ],
      status,
      timestamp,
      fees,
    });
  }

  #buildKeyringTransaction({
    type,
    id,
    account,
    scope,
    from,
    to,
    status,
    timestamp,
    fees,
    details,
  }: {
    type: TransactionType;
    id: string;
    account: XrplKeyringAccount;
    scope: KnownCaip2ChainId;
    from: KeyringTransaction['from'];
    to: KeyringTransaction['to'];
    status: TransactionStatus;
    timestamp: number;
    fees: KeyringTransaction['fees'];
    details?: KeyringTransaction['details'];
  }): KeyringTransaction {
    return {
      type,
      id,
      from,
      to,
      events: [
        {
          status,
          timestamp,
        },
      ],
      chain: scope,
      status,
      account: account.id,
      timestamp,
      fees,
      ...(details === undefined ? {} : { details }),
    };
  }

  #resolveTimestamp(
    timestamp: KeyringTransaction['timestamp'] | undefined,
  ): number {
    return timestamp ?? this.getCreateTime();
  }

  /**
   * Gets a timestamp in seconds since epoch.
   *
   * @param timestamp - Optional Unix timestamp in seconds; defaults to the current time.
   * @returns Timestamp in seconds since epoch.
   */
  getCreateTime(timestamp?: number): number {
    return Math.floor(timestamp ?? Date.now() / 1000); // seconds since epoch
  }

  /**
   * Gets the base fees for a transaction.
   *
   * @param feeAmountInDrops - The fee amount in drops.
   * @param scope - The CAIP-2 chain ID.
   * @returns The base fees for a transaction.
   */
  getBaseFees(
    feeAmountInDrops: BigNumber,
    scope: KnownCaip2ChainId,
  ): KeyringTransaction['fees'] {
    return [
      {
        type: FeeType.Base,
        asset: {
          unit: NATIVE_ASSET_SYMBOL,
          type: getSlip44AssetId(scope),
          // Fee is stored in drops (smallest XRP unit).
          amount: toDisplayBalance(feeAmountInDrops),
          fungible: true,
        },
      },
    ];
  }
}
