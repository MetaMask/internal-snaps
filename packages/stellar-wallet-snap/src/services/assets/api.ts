import {
  boolean,
  create,
  defaulted,
  nullable,
  number,
  optional,
  string,
  type,
  union,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import {
  KnownCaip19AssetIdOrSlip44IdStruct,
  KnownCaip19ClassicAssetStruct,
  KnownCaip19Sep41AssetStruct,
  KnownCaip19Slip44IdStruct,
  KnownCaip2ChainIdStruct,
  ValidAmountStruct,
  ValidStellarAmountStruct,
  ValidStellarInt64Struct,
} from '../../api';
import { STELLAR_DECIMAL_PLACES } from '../../constants';
import { hasDecimals, toSmallestUnit } from '../../utils';
import { InvalidCoreAssetException } from './exceptions';

/**
 * Controller `Asset.metadata` fields Stellar needs from Core.
 * Uses `type` so other catalog fields (`aggregators`, `type`, …) are allowed.
 * Classic issuer is not read from here; parse it from the CAIP-19 `id`.
 */
export const CoreAssetMetadataStruct = type({
  symbol: string(),
  decimals: number(),
  name: optional(string()),
  image: optional(string()),
});

/** Core `Asset.balance` fields shared by all asset types. `amount` is human units. */
export const CoreAssetBalanceStruct = type({
  amount: ValidAmountStruct,
});

/**
 * Core `Asset.balance` for slip44: human XLM `amount` plus native keyring
 * metadata (`spendableBalance` / `minimumReserveBalance` are stroops).
 */
export const CoreNativeBalanceStruct = type({
  amount: ValidStellarAmountStruct,
  metadata: type({
    spendableBalance: ValidStellarInt64Struct,
    minimumReserveBalance: ValidStellarInt64Struct,
    // **DEPRECATED:** Accounts API has deprecated the decimal field.
    // Please don't use it in new code.
    decimal: optional(number()),
  }),
});

/**
 * Core `Asset.balance` for classic assets: human `amount` plus trustline
 * metadata. `limit` is a finite, non-negative string: either a display amount
 * (`"0.0"`, `"922337203685.4775807"`) or an integer stroop string.
 */
export const CoreClassicBalanceStruct = type({
  amount: ValidStellarAmountStruct,
  metadata: type({
    limit: ValidAmountStruct,
    authorized: defaulted(boolean(), true),
    // Keyring may omit sponsor or send null / "" when not sponsored.
    sponsor: optional(nullable(string())),
    sponsored: defaulted(boolean(), false),
  }),
});

const Slip44CoreAssetStruct = type({
  id: KnownCaip19Slip44IdStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreNativeBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

const ClassicCoreAssetStruct = type({
  id: KnownCaip19ClassicAssetStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreClassicBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

const Sep41CoreAssetStruct = type({
  id: KnownCaip19Sep41AssetStruct,
  chainId: KnownCaip2ChainIdStruct,
  balance: CoreAssetBalanceStruct,
  metadata: CoreAssetMetadataStruct,
});

/**
 * Stellar-shaped subset of AssetsController {@link Asset}: `id`, `chainId`,
 * `balance`, and `metadata`. Uses `type` so extra controller fields are allowed.
 */
export const CoreAssetStruct = union([
  Slip44CoreAssetStruct,
  ClassicCoreAssetStruct,
  Sep41CoreAssetStruct,
]);

export type CoreAsset = Infer<typeof CoreAssetStruct>;
export type CoreNativeAsset = Infer<typeof Slip44CoreAssetStruct>;
export type CoreClassicAsset = Infer<typeof ClassicCoreAssetStruct>;
export type CoreSep41Asset = Infer<typeof Sep41CoreAssetStruct>;
export type CoreAssetMetadata = Infer<typeof CoreAssetMetadataStruct>;

export function isCoreNativeAsset(asset: CoreAsset): asset is CoreNativeAsset {
  return Slip44CoreAssetStruct.is(asset);
}

export function isCoreClassicAsset(
  asset: CoreAsset,
): asset is CoreClassicAsset {
  return ClassicCoreAssetStruct.is(asset);
}

export function isCoreSep41Asset(asset: CoreAsset): asset is CoreSep41Asset {
  return Sep41CoreAssetStruct.is(asset);
}

/**
 * A Core row whose CAIP-19 id is Stellar. Other chains are skipped; a Stellar
 * id with an invalid body is a parse error.
 *
 * @param value - Raw AssetsController asset.
 * @returns Whether `value` has a Stellar asset id.
 */
const StellarCoreAssetIdStruct = type({
  id: KnownCaip19AssetIdOrSlip44IdStruct,
});

/**
 * A removed trustline is stored with a zero limit (`"0"`, `"0.0"`, `"0.0000000"`).
 *
 * @param limit - Classic trustline limit from Core balance metadata.
 * @returns Whether the limit is numeric zero.
 */
function isZeroTrustlineLimit(limit: string): boolean {
  const amount = new BigNumber(limit);
  return amount.isFinite() && amount.isZero();
}

/**
 * Convert a trustline limit to a stroop string.
 *
 * - If it has a fractional part, it is scaled to stroops.
 * - If it is an integer, it is returned unchanged.
 *
 * @param limit - Trustline limit.
 * @returns Integer stroop string.
 */
function normalizeCoreTrustlineLimit(limit: string): string {
  const amount = new BigNumber(limit);
  if (!amount.isFinite() || !hasDecimals(amount)) {
    return limit;
  }
  return toSmallestUnit(amount, STELLAR_DECIMAL_PLACES).toFixed(0);
}

/**
 * Whether classic trustline reserve is sponsored.
 * A non-empty sponsor on a removed trustline (limit 0) is stale and does not count.
 *
 * @param sponsor - Trustline sponsor account address, if any.
 * @param limit - Trustline limit.
 * @returns `true` when `sponsor` is a non-empty string and `limit` is not zero.
 */
function isSponsored(
  sponsor: string | null | undefined,
  limit: string,
): boolean {
  return (
    typeof sponsor === 'string' &&
    sponsor.length > 0 &&
    !isZeroTrustlineLimit(limit)
  );
}

/**
 * Validates a Stellar `Asset` into {@link CoreAsset}.
 *
 * @param value - Raw AssetsController asset.
 * @returns The Stellar-shaped asset, or `null` when the payload is not Stellar.
 * @throws {@link InvalidCoreAssetException} When the id is Stellar but the row is invalid.
 */
export function parseCoreStellarAsset(value: unknown): CoreAsset | null {
  if (!StellarCoreAssetIdStruct.is(value)) {
    return null;
  }

  try {
    const asset = create(value, CoreAssetStruct);
    if (!asset.id.startsWith(`${asset.chainId}/`)) {
      throw new Error('Asset ID does not match chain ID');
    }
    if (isCoreClassicAsset(asset)) {
      const { sponsor } = asset.balance.metadata;
      const limit = normalizeCoreTrustlineLimit(asset.balance.metadata.limit);
      asset.balance.metadata.limit = limit;
      if (isZeroTrustlineLimit(limit)) {
        // A removed trustline must not keep the previous sponsor account id.
        asset.balance.metadata.sponsor = null;
      }
      asset.balance.metadata.sponsored = isSponsored(sponsor, limit);
    }
    return asset;
  } catch (error) {
    throw new InvalidCoreAssetException(
      `${value.id} is not a valid Stellar asset`,
      {
        cause: error,
        data: value,
      },
    );
  }
}

/**
 * Validates a Core `Asset.metadata` into {@link CoreAssetMetadata}.
 *
 * @param value - Raw AssetsController asset metadata.
 * @returns The asset metadata, or `null` when the payload is not valid.
 */
export function parseCoreAssetMetadata(
  value: unknown,
): CoreAssetMetadata | null {
  try {
    return create(value, CoreAssetMetadataStruct);
  } catch {
    return null;
  }
}
