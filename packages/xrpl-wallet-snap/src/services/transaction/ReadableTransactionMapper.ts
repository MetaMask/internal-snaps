import type { Json } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { convertTxFlagsToNumber, parseTransactionFlags } from 'xrpl';
import type { Transaction as XrplSdkTransaction } from 'xrpl';

import type { KnownCaip2ChainId } from '../../api';
import { toDisplayBalance } from '../../utils';
import { XrplTransactionType } from '../network/api';
import type { Transaction } from './Transaction';
import { isIouPaymentAmt, isMptPaymentAmt } from './utils';

/**
 * Semantic hint for how a confirmation row should be rendered.
 */
export const FieldType = {
  address: 'address',
  asset: 'asset',
  assetWithAmount: 'assetWithAmount',
  amount: 'amount',
  price: 'price',
  text: 'text',
  number: 'number',
  boolean: 'boolean',
  json: 'json',
  copyable: 'copyable',
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

/**
 * One labeled value row for transaction confirmation UI.
 */
export type ReadableTransactionField = {
  key: string;
  value: Json;
  type: FieldType;
};

/**
 * @deprecated Prefer {@link ReadableTransactionField}. Kept so existing UI
 * imports keep compiling during the XRPL confirm rewrite.
 */
export type ReadableOperationField = ReadableTransactionField;

/**
 * One XRPL transaction (or Batch inner) turned into plain data for UX.
 */
export type ReadableTransactionJson = {
  scope: KnownCaip2ChainId;
  type: XrplTransactionType;
  account: string;
  feeDrops: string;
  destinationTag: number | null;
  params: ReadableTransactionField[];
  innerTransactions: ReadableTransactionJson[];
};

/** Autofill / signing / envelope fields never shown as confirmation params. */
const HIDDEN_KEYS = new Set([
  'TransactionType',
  'Account',
  'Sequence',
  'LastLedgerSequence',
  'Fee',
  'SigningPubKey',
  'TxnSignature',
  'Signers',
  'NetworkID',
  'TicketSequence',
  'AccountTxnID',
  // Surfaced as `innerTransactions` / top-level `destinationTag`.
  'RawTransactions',
  'DestinationTag',
]);

const ADDRESS_KEYS = new Set([
  'Destination',
  'Owner',
  'Issuer',
  'Authorize',
  'Unauthorize',
  'RegularKey',
  'OtherChainSource',
  'OtherChainDestination',
  'AttestationSignerAccount',
  'OtherChainAccount',
  'Holder',
]);

const AMOUNT_KEYS = new Set([
  'Amount',
  'Amount2',
  'DeliverMax',
  'DeliverMin',
  'SendMax',
  'LimitAmount',
  'TakerPays',
  'TakerGets',
  'NFTokenBrokerFee',
  'Balance',
  'SignatureReward',
  'MinAccountCreateAmount',
  'BidMin',
  'BidMax',
  'EPrice',
  'LPTokenOut',
  'LPTokenIn',
  'MaximumAmount',
]);

const ASSET_KEYS = new Set([
  'Asset',
  'Asset2',
  'AmountAsset',
  'LPTokenOut',
  'LPTokenIn',
]);

const NUMBER_KEYS = new Set([
  'SourceTag',
  'OfferSequence',
  'TransferRate',
  'TickSize',
  'NFTokenTaxon',
  'TransferFee',
  'TicketCount',
  'SignerQuorum',
  'Expiration',
  'CancelAfter',
  'FinishAfter',
  'SettleDelay',
  'OwnerCount',
  'DomainID',
  'ClearFlag',
  'SetFlag',
  'TouchCount',
  'QualityIn',
  'QualityOut',
  'BidMin',
  'BidMax',
  'EPrice',
  'TradingFee',
  'VoteWeight',
]);

const COPYABLE_KEYS = new Set([
  'NFTokenID',
  'NFTokenSellOffer',
  'NFTokenBuyOffer',
  'NFTokenMinter',
  'Channel',
  'CheckID',
  'InvoiceID',
  'Condition',
  'Fulfillment',
  'PublicKey',
  'OwnerNode',
  'MPTokenIssuanceID',
  'Domain',
  'EmailHash',
  'MessageKey',
  'URI',
  'Data',
  'DIDDocument',
  'OracleDocumentID',
  'Provider',
  'AssetClass',
  'LastUpdateTime',
  'XChainClaimID',
  'XChainAccountCreateCount',
  'XChainClaimCount',
  'Signature',
  'AttestationRewardAccount',
  'AmountCredentialIDs',
  'CredentialIDs',
  'MPTokenMetadata',
]);

const JSON_KEYS = new Set([
  'Paths',
  'Memos',
  'SignerEntries',
  'NFTokenOffers',
  'AuthAccounts',
  'PriceDataSeries',
  'XChainBridge',
]);

/**
 * Preferred display order per transaction type. Residual keys still appear after.
 */
const TYPE_FIELD_ORDER: Record<XrplTransactionType, readonly string[]> = {
  [XrplTransactionType.Payment]: [
    'Destination',
    'Amount',
    'DeliverMax',
    'DeliverMin',
    'SendMax',
    'Paths',
    'InvoiceID',
    'SourceTag',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.TrustSet]: [
    'LimitAmount',
    'QualityIn',
    'QualityOut',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.OfferCreate]: [
    'TakerGets',
    'TakerPays',
    'Expiration',
    'OfferSequence',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.OfferCancel]: ['OfferSequence', 'Memos'],
  [XrplTransactionType.AccountSet]: [
    'Domain',
    'EmailHash',
    'MessageKey',
    'TransferRate',
    'TickSize',
    'NFTokenMinter',
    'ClearFlag',
    'SetFlag',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.AccountDelete]: ['Destination', 'Memos'],
  [XrplTransactionType.SetRegularKey]: ['RegularKey', 'Memos'],
  [XrplTransactionType.SignerListSet]: [
    'SignerQuorum',
    'SignerEntries',
    'Memos',
  ],
  [XrplTransactionType.TicketCreate]: ['TicketCount', 'Memos'],
  [XrplTransactionType.DepositPreauth]: ['Authorize', 'Unauthorize', 'Memos'],
  [XrplTransactionType.CheckCreate]: [
    'Destination',
    'SendMax',
    'Expiration',
    'InvoiceID',
    'Memos',
  ],
  [XrplTransactionType.CheckCash]: ['CheckID', 'Amount', 'DeliverMin', 'Memos'],
  [XrplTransactionType.CheckCancel]: ['CheckID', 'Memos'],
  [XrplTransactionType.EscrowCreate]: [
    'Destination',
    'Amount',
    'Condition',
    'CancelAfter',
    'FinishAfter',
    'Memos',
  ],
  [XrplTransactionType.EscrowFinish]: [
    'Owner',
    'OfferSequence',
    'Condition',
    'Fulfillment',
    'Memos',
  ],
  [XrplTransactionType.EscrowCancel]: ['Owner', 'OfferSequence', 'Memos'],
  [XrplTransactionType.PaymentChannelCreate]: [
    'Destination',
    'Amount',
    'SettleDelay',
    'PublicKey',
    'CancelAfter',
    'Memos',
  ],
  [XrplTransactionType.PaymentChannelFund]: [
    'Channel',
    'Amount',
    'Expiration',
    'Memos',
  ],
  [XrplTransactionType.PaymentChannelClaim]: [
    'Channel',
    'Balance',
    'Amount',
    'Signature',
    'PublicKey',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.NFTokenMint]: [
    'NFTokenTaxon',
    'Issuer',
    'TransferFee',
    'URI',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.NFTokenBurn]: ['NFTokenID', 'Owner', 'Memos'],
  [XrplTransactionType.NFTokenCreateOffer]: [
    'NFTokenID',
    'Amount',
    'Owner',
    'Destination',
    'Expiration',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.NFTokenCancelOffer]: ['NFTokenOffers', 'Memos'],
  [XrplTransactionType.NFTokenAcceptOffer]: [
    'NFTokenSellOffer',
    'NFTokenBuyOffer',
    'NFTokenBrokerFee',
    'Memos',
  ],
  [XrplTransactionType.Clawback]: ['Amount', 'Memos'],
  [XrplTransactionType.AMMCreate]: ['Amount', 'Amount2', 'TradingFee', 'Memos'],
  [XrplTransactionType.AMMDeposit]: [
    'Asset',
    'Asset2',
    'Amount',
    'Amount2',
    'EPrice',
    'LPTokenOut',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.AMMWithdraw]: [
    'Asset',
    'Asset2',
    'Amount',
    'Amount2',
    'EPrice',
    'LPTokenIn',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.AMMBid]: [
    'Asset',
    'Asset2',
    'BidMin',
    'BidMax',
    'AuthAccounts',
    'Memos',
  ],
  [XrplTransactionType.AMMVote]: ['Asset', 'Asset2', 'TradingFee', 'Memos'],
  [XrplTransactionType.AMMDelete]: ['Asset', 'Asset2', 'Memos'],
  [XrplTransactionType.MPTokenAuthorize]: [
    'MPTokenIssuanceID',
    'Holder',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.MPTokenIssuanceCreate]: [
    'AssetScale',
    'TransferFee',
    'MaximumAmount',
    'Flags',
    'MPTokenMetadata',
    'Memos',
  ],
  [XrplTransactionType.MPTokenIssuanceDestroy]: ['MPTokenIssuanceID', 'Memos'],
  [XrplTransactionType.MPTokenIssuanceSet]: [
    'MPTokenIssuanceID',
    'Holder',
    'Flags',
    'Memos',
  ],
  [XrplTransactionType.DIDSet]: ['DIDDocument', 'URI', 'Data', 'Memos'],
  [XrplTransactionType.DIDDelete]: ['Memos'],
  [XrplTransactionType.OracleSet]: [
    'OracleDocumentID',
    'Provider',
    'AssetClass',
    'LastUpdateTime',
    'PriceDataSeries',
    'URI',
    'Memos',
  ],
  [XrplTransactionType.OracleDelete]: ['OracleDocumentID', 'Memos'],
  [XrplTransactionType.Batch]: ['Flags', 'Memos'],
  [XrplTransactionType.XChainAccountCreateCommit]: [
    'XChainBridge',
    'Destination',
    'Amount',
    'SignatureReward',
    'Memos',
  ],
  [XrplTransactionType.XChainAddAccountCreateAttestation]: [
    'XChainBridge',
    'OtherChainSource',
    'Destination',
    'Amount',
    'AttestationRewardAccount',
    'AttestationSignerAccount',
    'WasLockingChainSend',
    'XChainAccountCreateCount',
    'Signature',
    'PublicKey',
    'SignatureReward',
    'Memos',
  ],
  [XrplTransactionType.XChainAddClaimAttestation]: [
    'XChainBridge',
    'OtherChainSource',
    'Amount',
    'AttestationRewardAccount',
    'AttestationSignerAccount',
    'WasLockingChainSend',
    'XChainClaimID',
    'Destination',
    'Signature',
    'PublicKey',
    'Memos',
  ],
  [XrplTransactionType.XChainClaim]: [
    'XChainBridge',
    'XChainClaimID',
    'Destination',
    'Amount',
    'Memos',
  ],
  [XrplTransactionType.XChainCommit]: [
    'XChainBridge',
    'Amount',
    'XChainClaimID',
    'OtherChainDestination',
    'Memos',
  ],
  [XrplTransactionType.XChainCreateBridge]: [
    'XChainBridge',
    'SignatureReward',
    'MinAccountCreateAmount',
    'Memos',
  ],
  [XrplTransactionType.XChainCreateClaimID]: [
    'XChainBridge',
    'SignatureReward',
    'OtherChainSource',
    'Memos',
  ],
  [XrplTransactionType.XChainModifyBridge]: [
    'XChainBridge',
    'SignatureReward',
    'MinAccountCreateAmount',
    'Flags',
    'Memos',
  ],
};

/**
 * Maps XRPL transaction JSON to a serializable display DTO for confirmation UI.
 *
 * Reserved: a future on-chain / keyring indexer should use `TransactionMapper`,
 * not this class.
 */
export class ReadableTransactionMapper {
  /**
   * Builds a readable confirmation summary for an XRPL transaction.
   *
   * @param transaction - Snap {@link Transaction} wrapper.
   * @returns Serializable display DTO.
   */
  map(transaction: Transaction): ReadableTransactionJson {
    return this.#mapOne(transaction);
  }

  #mapOne(transaction: Transaction): ReadableTransactionJson {
    const raw = transaction.getRaw();
    const type = raw.TransactionType as XrplTransactionType;
    const destinationTag =
      type === XrplTransactionType.Payment &&
      typeof raw.DestinationTag === 'number'
        ? raw.DestinationTag
        : null;

    return {
      scope: transaction.scope,
      type,
      account: transaction.account,
      feeDrops: transaction.fee.toFixed(0),
      destinationTag,
      params: this.#mapParams(raw, type),
      innerTransactions: transaction.innerTransactions.map((inner) =>
        this.#mapOne(inner),
      ),
    };
  }

  #mapParams(
    raw: XrplSdkTransaction,
    type: XrplTransactionType,
  ): ReadableTransactionField[] {
    const params: ReadableTransactionField[] = [];
    const seen = new Set<string>();
    const order = TYPE_FIELD_ORDER[type] ?? [];

    for (const key of order) {
      if (!Object.hasOwn(raw, key)) {
        continue;
      }
      const value = (raw as Record<string, unknown>)[key];
      if (value === undefined || value === null) {
        continue;
      }
      params.push(this.#mapField(raw, key, value as Json));
      seen.add(key);
    }

    for (const [key, value] of Object.entries(raw)) {
      if (
        HIDDEN_KEYS.has(key) ||
        seen.has(key) ||
        value === undefined ||
        value === null
      ) {
        continue;
      }
      params.push(this.#mapField(raw, key, value as Json));
    }

    return params;
  }

  #mapField(
    raw: XrplSdkTransaction,
    xrplKey: string,
    value: Json,
  ): ReadableTransactionField {
    const key = toParamKey(xrplKey);

    if (xrplKey === 'Flags') {
      return this.field(key, flagsToText(raw), FieldType.text);
    }

    if (AMOUNT_KEYS.has(xrplKey)) {
      const amountField = this.#mapAmountValue(key, value);
      if (amountField !== null) {
        return amountField;
      }
    }

    if (ASSET_KEYS.has(xrplKey)) {
      const assetRef = assetReferenceFromValue(value);
      if (assetRef !== null) {
        return this.field(key, assetRef, FieldType.asset);
      }
    }

    if (ADDRESS_KEYS.has(xrplKey) && typeof value === 'string') {
      return this.field(key, value, FieldType.address);
    }

    if (NUMBER_KEYS.has(xrplKey) && typeof value === 'number') {
      return this.field(key, value, FieldType.number);
    }

    if (COPYABLE_KEYS.has(xrplKey)) {
      return this.field(
        key,
        typeof value === 'string' ? value : value,
        FieldType.copyable,
      );
    }

    if (
      JSON_KEYS.has(xrplKey) ||
      (typeof value === 'object' && value !== null)
    ) {
      return this.field(key, value, FieldType.json);
    }

    if (typeof value === 'boolean') {
      return this.field(key, value, FieldType.boolean);
    }

    if (typeof value === 'number') {
      return this.field(key, value, FieldType.number);
    }

    return this.field(key, value, FieldType.text);
  }

  #mapAmountValue(key: string, value: Json): ReadableTransactionField | null {
    if (typeof value === 'string') {
      return this.field(
        key,
        ['native', toDisplayBalance(new BigNumber(value))],
        FieldType.assetWithAmount,
      );
    }
    if (isIouPaymentAmt(value)) {
      return this.field(
        key,
        [
          `${value.currency}.${value.issuer}`,
          this.normalizeAmount(value.value),
        ],
        FieldType.assetWithAmount,
      );
    }
    if (isMptPaymentAmt(value)) {
      return this.field(
        key,
        [value.mpt_issuance_id, this.normalizeAmount(value.value)],
        FieldType.assetWithAmount,
      );
    }
    // Amount-shaped without `value` (e.g. AMM Asset) falls through.
    return null;
  }

  protected field(
    key: string,
    value: Json,
    type: FieldType,
  ): ReadableTransactionField {
    let normalizedValue: Json = value;
    if (type === FieldType.amount) {
      normalizedValue = this.normalizeAmount(value);
    } else if (type === FieldType.assetWithAmount && Array.isArray(value)) {
      const [asset, amount] = value as [Json, Json];
      normalizedValue = [asset, this.normalizeAmount(amount)];
    }
    return { key, value: normalizedValue, type };
  }

  protected normalizeAmount(value: Json): Json {
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/u.test(value)) {
      return new BigNumber(value).toFixed();
    }
    return value;
  }
}

/**
 * Converts an XRPL PascalCase field name to a camelCase param key for i18n.
 *
 * @param xrplKey - Ledger JSON field name.
 * @returns camelCase key.
 */
function toParamKey(xrplKey: string): string {
  return xrplKey.charAt(0).toLowerCase() + xrplKey.slice(1);
}

/**
 * Resolves an XRPL Asset / Currency object to a display asset reference.
 *
 * @param value - Asset JSON (`native`-like currency XRP, or IOU).
 * @returns `'native'` / `CODE.issuer`, or `null` when unrecognized.
 */
function assetReferenceFromValue(value: Json): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const asset = value as { currency?: string; issuer?: string };
  if (typeof asset.currency !== 'string') {
    return null;
  }
  if (asset.currency === 'XRP' && asset.issuer === undefined) {
    return 'native';
  }
  if (typeof asset.issuer === 'string') {
    return `${asset.currency}.${asset.issuer}`;
  }
  return null;
}

/**
 * Turns transaction `Flags` into comma-separated `tf*` labels via xrpl.js.
 *
 * Falls back to the numeric value when no named flags decode (unknown type /
 * bits). Returns `none` when Flags is absent or zero.
 *
 * @param raw - XRPL transaction JSON (needs `TransactionType` + `Flags`).
 * @returns Human-readable flag text.
 */
function flagsToText(raw: XrplSdkTransaction): string {
  const numericFlags = convertTxFlagsToNumber(raw);
  if (numericFlags === 0) {
    return 'none';
  }

  const parsed = parseTransactionFlags(raw) as Record<string, boolean>;
  const parts = Object.keys(parsed).filter((flagName) => parsed[flagName]);
  return parts.length > 0 ? parts.join(', ') : String(numericFlags);
}
