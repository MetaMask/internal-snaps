import snapManifest from '../snap.manifest.json';

/**
 * Scopes supported by this snap for account creation and discovery. The snap
 * manifest's `endowment:keyring` capabilities are the source of truth.
 */
export const SUPPORTED_SCOPES =
  snapManifest.initialPermissions['endowment:keyring'].capabilities.scopes;

/**
 * Private-key export encoding supported by this snap.
 *
 * `hex` (XRPL secp256k1 private key: `00` + 32-byte hex). 
 * TODO: use `base58` if the account is ed25519
 */
export const PRIVATE_KEY_EXPORT_ENCODING = 'hex' as const;

/**
 * The base reserve for the Xrpl network.
 *
 * @see https://developers.xrpl.org/docs/learn/fundamentals/xrpl-data-structures/accounts
 */
export const XRP_PER_BASE_RESERVE_OWNER_ITEM = 0.2;

export const XRP_PER_BASE_RESERVE_ACCOUNT = 1;

/** Xrpl native amounts use 6 fractional digits (drops per whole XRP). */
export const DROPS_PER_XRP = 1_000_000;
/**
 * One owner reserve in drops (`XRP_PER_BASE_RESERVE_OWNER_ITEM` × {@link DROPS_PER_XRP}).
 */
export const BASE_RESERVE_DROPS =
  XRP_PER_BASE_RESERVE_OWNER_ITEM * DROPS_PER_XRP;

/**
 * Base-reserve units reserved for the account entry itself (not subentries).
 *
 * Xrpl base reserve is 1 XRP per account. Owner reserves are
 * {@link XRP_PER_BASE_RESERVE_OWNER_ITEM} XRP each.
 *
 * @see https://developers.xrpl.org/docs/learn/fundamentals/xrpl-data-structures/accounts#minimum-balance
 */
export const ACCOUNT_MINIMUM_BASE_RESERVE_UNIT = 1;

/**
 * Xrpl's coin type
 *
 * @see https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 */
export const XRPL_COIN_TYPE = 144;

/**
 * Xrpl curve type.
 *
 * @see https://developers.xrpl.org/docs/learn/fundamentals/transactions/signatures-multisig
 */
export const XRPL_SECP_CURVE = 'secp256k1';

export const XRPL_ED25519_CURVE = 'ed25519';

/** Xrpl BIP32 derivation path prefix. */
export const XRPL_SECP_DERIVATION_PATH_PREFIX = `m/44'/${XRPL_COIN_TYPE}'/0'/0`;

export const XRPL_ED25519_DERIVATION_PATH_PREFIX = `m/44'/${XRPL_COIN_TYPE}'`;
/**
 * Decimal places for native XRP (drops). 1 XRP = 10^6 drops.
 *
 * @see https://xrpl.org/docs/concepts/tokens/fungible-tokens/amounts
 */
export const XRPL_DECIMAL_PLACES = 6;

/**
 * Maximum fractional digits for IOU `Amount.value` strings used by this snap.
 * Issued-currency amounts are not drop-scaled; precision is constrained by XRPL
 * significant-digit rules, not a fixed 6-decimal scale.
 *
 * @see https://xrpl.org/docs/concepts/tokens/fungible-tokens/amounts
 */
export const IOU_DECIMAL_PLACES = 15;

/**
 * Fallback fractional-digit width for MPT display helpers when an issuance
 * `AssetScale` is unavailable. Prefer the ledger `AssetScale` when present.
 *
 * @see https://xrpl.org/docs/concepts/tokens/fungible-tokens/amounts
 */
export const MPT_DECIMAL_PLACES = 15;

/**
 * The symbol for the native asset of Xrpl.
 */
export const NATIVE_ASSET_SYMBOL = 'XRP';

/**
 * The name for the native asset of Xrpl.
 */
export const NATIVE_ASSET_NAME = 'XRP';

/**
 * Protocol minimum base fee in drops.
 *
 * @see https://developers.xrpl.org/docs/learn/fundamentals/fees-resource-limits-metering
 */
export const BASE_FEE_XRP = 0.00001;

/**
 * The default load factor for the Xrpl network.
 */
export const DEFAULT_LOAD_FACTOR = 1;

/**
 * The maximum capped fee in XRP for the Xrpl network.
 */
export const MAX_CAPPED_FEE_XRP = 2;

/**
 * Max allowed fee increase vs the confirmation-time draft (2×).
 * Baseline is the draft built when the dialog opened (not later UI refreshes).
 */
export const CONFIRMED_TRANSACTION_FEE_BUFFER_RATIO = 2.0;

/**
 * The maximum balance in drops for the Xrpl network.
 */
export const MAX_DROPS = '100000000000000000';

/**
 * The maximum mpt amount for the Xrpl network - INT64.
 */
export const MAX_MPT = '9223372036854775807';

/**
 * The maximum iou amount for the Xrpl network.
 */
export const MAX_IOU = '9999999999999999e80';

/**
 * The type for the keyring account.
 */
export const KEYRING_ACCOUNT_TYPE = `any:account`;

/**
 * Maximum native XRP threshold for an incoming
 * payment to be treated as dust spam.
 *
 * Incoming native XRP payments at or below this value are omitted from activity history.
 */
export const DUST_XRP_AMOUNT = '0.001';

/**
 * XRPL `MPTokenIssuanceID` / CAIP-19 `xls33` reference length (192-bit hex).
 */
export const LEDGER_MPT_ISSUANCE_ID_LENGTH = 48;

/**
 * Maximum MPT issuance id length (same as the ledger / CAIP-19 form).
 */
export const MAX_MPT_ISSUANCE_ID_LENGTH = LEDGER_MPT_ISSUANCE_ID_LENGTH;

/**
 * The maximum iou asset code length.
 */
export const MAX_IOU_ASSET_CODE_LENGTH = 40;

/**
 * The network id for the Xrpl mainnet.
 */
export const NATIVE_MAINNET_NETWORK_ID = 0;

/**
 * Ledgers after the latest validated ledger during which an unconfirmed
 * transaction may still be included. About one minute. Same offset xrpl.js
 * autofill adds when it sets `LastLedgerSequence`.
 */
export const LEDGER_SEQUENCE_OFFSET = 20;
