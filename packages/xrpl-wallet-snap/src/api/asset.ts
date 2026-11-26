import type { Infer } from '@metamask/superstruct';
import { union } from '@metamask/superstruct';
import { definePattern } from '@metamask/utils';

import { XRPL_COIN_TYPE } from '../constants';
import { KnownCaip2ChainId } from './network';

/** Xrpl Asset namespace */
/** Please see https://namespaces.chainagnostic.org/xrpl/caip19#asset-namespaces */
export const AssetType = {
  Native: 'slip44',
  Token: 'token',
  Mpt: 'xls33',
} as const;

export type AssetType = (typeof AssetType)[keyof typeof AssetType];

/**
 * CAIP-19 Slip44 ID: {chainId}/slip44:{coinType}
 *
 * @see https://namespaces.chainagnostic.org/xrpl/caip19#slip44-ids-slip44
 */
export const KnownCaip19Slip44IdStruct =
  definePattern<`${KnownCaip2ChainId}/${typeof AssetType.Native}:${typeof XRPL_COIN_TYPE}`>(
    'KnownCaip19Slip44Id',
    /^xrpl:0\/slip44:144$/u,
  );

/**
 * CAIP-19 Slip44 ID Map
 */
export const KnownCaip19Slip44IdMap: Record<
  KnownCaip2ChainId,
  KnownCaip19Slip44Id
> = {
  [KnownCaip2ChainId.Mainnet]: `${KnownCaip2ChainId.Mainnet}/${AssetType.Native}:${XRPL_COIN_TYPE}`,
};

/**
 * Validation struct for an ISO/symbol (3-character) or 160-bit hex currency
 * code on a trust line / issued amount.
 *
 * Native `XRP` is not allowed — use slip44 for the native asset.
 */
export const CurrencyCodeStruct = definePattern(
  'CurrencyCode',
  /^(?:(?!XRP$)[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-Fa-f]{40})$/u,
);

/**
 * CAIP-19 token asset ID: {chainId}/token:{assetCode}-{issuerAddress}
 *
 * @see https://namespaces.chainagnostic.org/xrpl/caip19#trust-line-tokens-token
 */
export const KnownCaip19IouAssetStruct =
  definePattern<`${KnownCaip2ChainId}/${typeof AssetType.Token}:${string}.${string}`>(
    'KnownCaip19IouAsset',
    /^xrpl:0\/token:(?!XRP\.)(?:[A-Za-z0-9?!@#$%^&*<>(){}[\]|]{3}|[0-9A-F]{40})\.r[1-9A-HJ-NP-Za-km-z]{24,34}$/u,
  );

/**
 * Validation struct for a Mpt issuance id
 */
export const MptIssuanceIdStruct = definePattern(
  'MptIssuanceId',
  // 48 hex (192-bit ledger id).
  /^(?:[0-9A-F]{48})$/u,
);

export type MptIssuanceId = Infer<typeof MptIssuanceIdStruct>;

/**
 * CAIP-19 Mpt asset ID: {chainId}/xls33:{mptIssuanceId}
 *
 * @see https://namespaces.chainagnostic.org/xrpl/caip19#multi-purpose-tokens-xls33
 */
export const KnownCaip19MptAssetStruct =
  definePattern<`${KnownCaip2ChainId}/${typeof AssetType.Mpt}:${string}`>(
    'KnownCaip19MptAsset',
    // 48-hex MPT issuance id (192-bit ledger / CAIP-19 form).
    /^xrpl:0\/xls33:(?:[0-9A-F]{48})$/u,
  );

/** Validation struct for a known Xrpl CAIP-19 asset id or slip44 id. */
export const KnownCaip19AssetIdOrSlip44IdStruct = union([
  KnownCaip19MptAssetStruct,
  KnownCaip19IouAssetStruct,
  KnownCaip19Slip44IdStruct,
]);

/** CAIP-19 Mpt asset ID */
export type KnownCaip19MptAssetId = Infer<typeof KnownCaip19MptAssetStruct>;

/** CAIP-19 Iou asset ID */
export type KnownCaip19IouAssetId = Infer<typeof KnownCaip19IouAssetStruct>;

/** CAIP-19 slip44 ID */
export type KnownCaip19Slip44Id = Infer<typeof KnownCaip19Slip44IdStruct>;

/** CAIP-19 asset ID */
export type KnownCaip19AssetId = KnownCaip19MptAssetId | KnownCaip19IouAssetId;

/** CAIP-19 asset ID or slip44 ID */
export type KnownCaip19AssetIdOrSlip44Id = Infer<
  typeof KnownCaip19AssetIdOrSlip44IdStruct
>;
