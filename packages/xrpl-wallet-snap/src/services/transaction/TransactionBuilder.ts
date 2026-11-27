import { BigNumber } from 'bignumber.js';
import type { Transaction as XrplTransaction } from 'xrpl';
import { MPTokenAuthorizeFlags } from 'xrpl';

import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip19Slip44Id,
} from '../../api';
import { IOU_DECIMAL_PLACES } from '../../constants';
import {
  parseIouAsset,
  parseMptIssuanceId,
  toLedgerMptIssuanceId,
} from '../../utils';
import { XrplTransactionType } from '../network';
import type { OnChainAccount } from '../on-chain-account/OnChainAccount';
import { TransactionBuilderException } from './exceptions';
import { assertAssetScopeMatch } from './utils';

/**
 * Builds unsigned XRPL transaction JSON.
 *
 * Fee and last ledger are left for {@link TransactionAutofiller}.
 * Autofill never sets `NetworkID` (mainnet must omit it).
 * `Account` and `Sequence` come from {@link OnChainAccount}.
 */
export class TransactionBuilder {
  /**
   * Builds a TrustSet for the given IOU.
   *
   * @param params - Options object.
   * @param params.assetId - CAIP-19 IOU asset id.
   * @param params.onChainAccount - Source account (sequence and account id).
   * @param params.limit - Trust line limit. Omit or `"0"` to clear the line.
   * @returns Unsigned TrustSet JSON.
   * @throws {TransactionBuilderException} If building fails.
   */
  changeTrust(params: {
    assetId: KnownCaip19IouAssetId;
    onChainAccount: OnChainAccount;
    limit?: string;
  }): XrplTransaction {
    try {
      const { onChainAccount, assetId, limit } = params;
      const { assetCode, assetIssuer } = parseIouAsset(assetId);
      return {
        TransactionType: XrplTransactionType.TrustSet,
        LimitAmount: {
          currency: assetCode,
          issuer: assetIssuer,
          value: limit ?? '0',
        },
        ...this.#buildCommon(assetId, onChainAccount),
      } as XrplTransaction;
    } catch (error: unknown) {
      throw new TransactionBuilderException(
        'Failed to build change trust transaction',
        { cause: error },
      );
    }
  }

  /**
   * Builds an MPTokenAuthorize for holder opt-in / opt-out.
   *
   * @param params - Options object.
   * @param params.assetId - CAIP-19 MPT asset id.
   * @param params.onChainAccount - Source account (sequence and account id).
   * @param params.authorize - `true` to authorize (opt-in); `false` to unauthorize.
   * @returns Unsigned MPTokenAuthorize JSON.
   * @throws {TransactionBuilderException} If building fails.
   */
  mptAuthorize(params: {
    assetId: KnownCaip19MptAssetId;
    onChainAccount: OnChainAccount;
    authorize: boolean;
  }): XrplTransaction {
    try {
      const { onChainAccount, assetId, authorize } = params;
      const issuanceId = toLedgerMptIssuanceId(parseMptIssuanceId(assetId));
      return {
        TransactionType: XrplTransactionType.MPTokenAuthorize,
        MPTokenIssuanceID: issuanceId,
        ...(authorize ? {} : { Flags: MPTokenAuthorizeFlags.tfMPTUnauthorize }),
        ...this.#buildCommon(assetId, onChainAccount),
      } as XrplTransaction;
    } catch (error: unknown) {
      throw new TransactionBuilderException(
        'Failed to build MPT authorize transaction',
        { cause: error },
      );
    }
  }

  /**
   * Builds an IOU Payment.
   *
   * @param params - Options object.
   * @param params.assetId - CAIP-19 IOU asset id.
   * @param params.onChainAccount - Source account.
   * @param params.amount - Amount in IOU display units.
   * @param params.destination - Destination classic address.
   * @param params.destinationTag - Optional XRPL destination tag.
   * @returns Unsigned Payment JSON.
   * @throws {TransactionBuilderException} If building fails.
   */
  iouPayment(params: {
    assetId: KnownCaip19IouAssetId;
    onChainAccount: OnChainAccount;
    amount: BigNumber;
    destination: string;
    destinationTag?: number;
  }): XrplTransaction {
    try {
      const { onChainAccount, assetId, amount, destination, destinationTag } =
        params;
      const { assetCode, assetIssuer } = parseIouAsset(assetId);
      return {
        TransactionType: XrplTransactionType.Payment,
        Destination: destination,
        Amount: {
          currency: assetCode,
          issuer: assetIssuer,
          value: amount.toFixed(IOU_DECIMAL_PLACES),
        },
        ...this.#buildCommon(assetId, onChainAccount, destinationTag),
      } as XrplTransaction;
    } catch (error: unknown) {
      throw new TransactionBuilderException(
        'Failed to build payment transaction',
        { cause: error },
      );
    }
  }

  /**
   * Builds a native XRP Payment.
   *
   * @param params - Options object.
   * @param params.assetId - CAIP-19 slip44 asset id.
   * @param params.onChainAccount - Source account.
   * @param params.amount - Amount in drops.
   * @param params.destination - Destination classic address.
   * @param params.destinationTag - Optional XRPL destination tag.
   * @returns Unsigned Payment JSON.
   * @throws {TransactionBuilderException} If building fails.
   */
  nativePayment(params: {
    assetId: KnownCaip19Slip44Id;
    onChainAccount: OnChainAccount;
    amount: BigNumber;
    destination: string;
    destinationTag?: number;
  }): XrplTransaction {
    try {
      const { onChainAccount, assetId, amount, destination, destinationTag } =
        params;
      return {
        TransactionType: XrplTransactionType.Payment,
        Destination: destination,
        Amount: amount.toFixed(0),
        ...this.#buildCommon(assetId, onChainAccount, destinationTag),
      } as XrplTransaction;
    } catch (error: unknown) {
      throw new TransactionBuilderException(
        'Failed to build payment transaction',
        { cause: error },
      );
    }
  }

  #buildCommon(
    assetId: KnownCaip19AssetIdOrSlip44Id,
    onChainAccount: OnChainAccount,
    destinationTag?: number,
  ): Record<string, unknown> {
    assertAssetScopeMatch(assetId, onChainAccount.scope);
    return {
      Account: onChainAccount.accountId,
      Sequence: Number(onChainAccount.sequenceNumber),
      ...(destinationTag === undefined
        ? {}
        : { DestinationTag: destinationTag }),
    };
  }
}
