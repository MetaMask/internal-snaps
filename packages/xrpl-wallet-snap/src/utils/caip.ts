import { parseCaipAssetType } from '@metamask/utils';

import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip19IouAssetId,
  KnownCaip19MptAssetId,
  KnownCaip19Slip44Id,
  KnownCaip2ChainId,
  MptIssuanceId,
} from '../api';
import {
  AssetType,
  CurrencyCodeStruct,
  KnownCaip19IouAssetStruct,
  KnownCaip19MptAssetStruct,
  KnownCaip19Slip44IdMap,
  KnownCaip19Slip44IdStruct,
  KnownCaip2ChainIdStruct,
  MptIssuanceIdStruct,
} from '../api';
import { MAX_IOU_ASSET_CODE_LENGTH } from '../constants';

/**
 * Canonical trust-line currency code.
 *
 * A 3-character code (`USD`, `EUR`, or a code that uses the XRPL symbol set)
 * is kept as written. A longer identifier such as `RLUSD` is encoded as
 * a 40-character (160-bit) hex string: the ASCII bytes, then zeros through 20
 * bytes. A value that is already 40 hex characters is uppercased.
 *
 * Custom identifiers are 1–20 alphanumeric characters. This assumes the
 * identifier contains no symbols. XRPL can encode printable ASCII in a
 * nonstandard code, but issued custom tickers in practice are alphanumeric
 * (for example `RLUSD`). Symbols remain valid only on 3-character codes,
 * which are accepted above.
 *
 * @param assetCode - 3-character code, custom identifier, or 160-bit hex code.
 * @returns Code stored on an IOU asset id.
 * @throws {Error} When the code is not a standard 3-character code, a 160-bit
 * hex code, or an alphanumeric custom identifier of 1–20 characters.
 * @example
 * ```
 * normalizeCurrencyCode('USD');
 * // 'USD'
 * normalizeCurrencyCode('RLUSD');
 * // '524C555344000000000000000000000000000000'
 * ```
 * @see https://xrpl.org/docs/references/protocol/data-types/currency-formats
 */
export function normalizeCurrencyCode(assetCode: string): string {
  // Native XRP is never an IOU currency code (CAIP uses slip44 instead).
  if (assetCode === 'XRP') {
    throw new Error(`Invalid IOU asset code: ${assetCode}`);
  }

  if (/^[0-9A-Fa-f]{40}$/u.test(assetCode)) {
    return assetCode.toUpperCase();
  }

  // 3-character codes are case-sensitive on XRPL. `eur` and `EUR` are different.
  if (CurrencyCodeStruct.is(assetCode)) {
    return assetCode;
  }

  // Assume custom identifiers contain no symbols. 3-character codes that use
  // the XRPL symbol set are handled by {@link CurrencyCodeStruct} above.
  const isCustomIdentifier = /^[a-zA-Z0-9]{1,20}$/u.test(assetCode);
  if (!isCustomIdentifier) {
    throw new Error(`Invalid IOU asset code: ${assetCode}`);
  }

  const encodedCode = Array.from(assetCode, (character: string) =>
    character.charCodeAt(0).toString(16).padStart(2, '0'),
  ).join('');
  return encodedCode.padEnd(MAX_IOU_ASSET_CODE_LENGTH, '0').toUpperCase();
}

/**
 * Inverse of {@link normalizeCurrencyCode}.
 *
 * Accepts only values that pass {@link CurrencyCodeStruct} (3-character codes
 * or 160-bit hex, never native `XRP`). Hex codes are decoded to ASCII with
 * trailing null padding dropped; 3-character codes are returned unchanged.
 *
 * @param assetCode - 3-character code or 160-bit hex currency code from a CAIP-19 IOU id.
 * @returns Denormalized currency code (for example `USD` or `RLUSD`).
 * @throws {Error} When `assetCode` is not a valid {@link CurrencyCodeStruct} value,
 * or when a 160-bit hex code has no non-null ASCII content.
 * @example
 * ```
 * denormalizeCurrencyCode('USD');
 * // 'USD'
 * denormalizeCurrencyCode('524C555344000000000000000000000000000000');
 * // 'RLUSD'
 * ```
 * @see https://xrpl.org/docs/references/protocol/data-types/currency-formats
 */
export function denormalizeCurrencyCode(assetCode: string): string {
  if (!CurrencyCodeStruct.is(assetCode)) {
    throw new Error(`Invalid currency code to denormalize: ${assetCode}`);
  }

  // After {@link CurrencyCodeStruct}, only a 3-character code or 40-hex remains.
  if (assetCode.length === 3) {
    return assetCode;
  }

  // Chunk hex bytes and decode to ASCII.
  const hexStringParts = assetCode.match(/.{2}/gu) ?? [];
  let decoded = '';
  for (const hexString of hexStringParts) {
    const codePoint = Number.parseInt(hexString, 16);
    if (codePoint === 0) {
      break;
    }
    decoded += String.fromCodePoint(codePoint);
  }

  if (decoded.length === 0) {
    throw new Error(`Invalid currency code to denormalize: ${assetCode}`);
  }

  return decoded;
}

/**
 * Converts the given parameters to a CAIP-19 non native asset ID.
 *
 * `assetCode` is normalized with {@link normalizeCurrencyCode}.
 *
 * @param scope - The CAIP-2 chain ID.
 * @param assetCode - The asset code.
 * @param assetIssuer - The asset issuer.
 * @returns The CAIP-19 asset ID.
 */
export function toCaip19IouAssetId(
  scope: KnownCaip2ChainId,
  assetCode: string,
  assetIssuer: string,
): KnownCaip19IouAssetId {
  return `${scope}/${AssetType.Token}:${normalizeCurrencyCode(assetCode)}.${assetIssuer}`;
}

/**
 * Converts the given parameters to a CAIP-19 Mpt asset ID.
 *
 * @param scope - The CAIP-2 chain ID.
 * @param mptIssuanceId - The MPT issuance id.
 * @returns The CAIP-19 Mpt asset ID.
 */
export function toCaip19MptAssetId(
  scope: KnownCaip2ChainId,
  mptIssuanceId: string,
): KnownCaip19MptAssetId {
  return `${scope}/${AssetType.Mpt}:${normalizeMptIssuanceId(mptIssuanceId)}`;
}

/**
 * Canonical 192-bit MPT issuance id (48 uppercase hex) for CAIP-19 `xls33`
 * asset references.
 *
 * @param mptIssuanceId - 48-character hex issuance id, or a CAIP-19 id whose
 * asset reference is one.
 * @returns 48-character uppercase hex id.
 * @example
 * ```
 * normalizeMptIssuanceId('05faa0df561e39fa605779b829bb5974e82b40af173d6af3');
 * // '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3'
 * ```
 * @see https://namespaces.chainagnostic.org/xrpl/caip19#multi-purpose-tokens-xls33
 */
export function normalizeMptIssuanceId(mptIssuanceId: string): string {
  const reference = mptIssuanceId.includes('/xls33:')
    ? mptIssuanceId.slice(mptIssuanceId.lastIndexOf(':') + 1)
    : mptIssuanceId;
  const normalized = reference.toUpperCase();
  if (!MptIssuanceIdStruct.is(normalized)) {
    throw new Error(`Invalid MPT issuance id: ${mptIssuanceId}`);
  }

  return normalized;
}

/**
 * 192-bit issuance id for `ledger_entry` `mpt_issuance` (same form as CAIP-19).
 *
 * @param mptIssuanceId - 48-character hex issuance id, or a CAIP-19 id whose
 * asset reference is one.
 * @returns 48-character uppercase hex id.
 * @throws {Error} When the id is not a valid 192-bit issuance id.
 */
export function toLedgerMptIssuanceId(mptIssuanceId: string): string {
  return normalizeMptIssuanceId(mptIssuanceId);
}

/**
 * Checks if the given asset ID is a slip44 ID.
 *
 * @param assetId - The CAIP-19 asset ID or slip44 ID.
 * @returns True if the asset ID is a slip44 ID, false otherwise.
 */
export function isSlip44Id(
  assetId: KnownCaip19AssetIdOrSlip44Id | string,
): assetId is KnownCaip19Slip44Id {
  return KnownCaip19Slip44IdStruct.is(assetId);
}

/**
 * Returns true if the given asset ID is a Mpt Asset ID.
 *
 * @param assetId - The CAIP-19 Mpt Asset ID.
 * @returns True if the asset ID is a Mpt Asset ID, false otherwise.
 */
export function isMptId(
  assetId: KnownCaip19AssetIdOrSlip44Id | string,
): assetId is KnownCaip19MptAssetId {
  return KnownCaip19MptAssetStruct.is(assetId);
}

/**
 * Checks if the given asset ID is an IOU asset ID.
 *
 * @param assetId - The CAIP-19 asset ID or slip44 ID.
 * @returns True if the asset ID is an IOU asset ID, false otherwise.
 */
export function isIouAssetId(
  assetId: KnownCaip19AssetIdOrSlip44Id | string,
): assetId is KnownCaip19IouAssetId {
  return KnownCaip19IouAssetStruct.is(assetId);
}

/**
 * Returns the asset reference from a CAIP-19 asset id.
 *
 * @param assetId - CAIP-19 asset id.
 * @returns Asset reference.
 */
export function getAssetReference(
  assetId: KnownCaip19AssetIdOrSlip44Id,
): string {
  const { assetReference } = parseCaipAssetType(assetId);
  return assetReference;
}

/**
 * Returns the known Xrpl chain id from a CAIP-19 asset id.
 *
 * @param assetId - CAIP-19 asset id.
 * @returns The CAIP-2 chain id, `xrpl:0`.
 * @throws {Error} When the parsed chain id is not a known Xrpl chain.
 */
export function getXrplAssetChainId(
  assetId: KnownCaip19AssetIdOrSlip44Id,
): KnownCaip2ChainId {
  const { chainId } = parseCaipAssetType(assetId);
  if (!KnownCaip2ChainIdStruct.is(chainId)) {
    throw new Error(`Invalid chain id: ${chainId}`);
  }
  return chainId;
}

/**
 * Returns the slip44 asset ID for the given scope.
 *
 * @param scope - The CAIP-2 chain ID.
 * @returns The slip44 asset ID.
 */
export function getSlip44AssetId(
  scope: KnownCaip2ChainId,
): KnownCaip19Slip44Id {
  return KnownCaip19Slip44IdMap[scope];
}

/**
 * Converts the given asset reference to a CAIP-19 asset reference.
 *
 * @param assetRef - The asset reference.
 * @returns The CAIP-19 asset reference.
 */
export function toCaipAssetReference(assetRef: string): string {
  // TODO: change to MPT asset reference detection
  if (!assetRef.includes(':')) {
    return assetRef;
  }
  // TODO: change to IOU asset reference detection
  const [assetCode, assetIssuer] = assetRef.split(':');
  if (!assetCode || !assetIssuer) {
    throw new Error(`Invalid asset reference: ${assetRef}`);
  }
  return `${assetCode}.${assetIssuer}`;
}

/**
 * Parses IOU asset code and issuer from CAIP-19 form.
 *
 * XRPL CAIP-19 uses `CODE.issuer`.
 *
 * @param assetReference - IOU asset reference (`CODE.issuer`).
 * @returns Parsed asset code and issuer account id.
 * @throws {Error} When the reference is not `CODE.issuer`.
 * @example
 * ```
 * parseIouAssetCodeIssuer('USD.rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
 * // { assetCode: 'USD', assetIssuer: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' }
 * ```
 */
export function parseIouAssetCodeIssuer(assetReference: string): {
  assetCode: string;
  assetIssuer: string;
} {
  const [assetCode, assetIssuer, ...rest] = assetReference.split('.');
  if (!assetCode || !assetIssuer || rest.length > 0) {
    throw new Error(`Invalid asset reference: ${assetReference}`);
  }
  return { assetCode, assetIssuer };
}

export function parseMptIssuanceId(
  assetId: KnownCaip19MptAssetId,
): MptIssuanceId {
  const { assetReference } = parseCaipAssetType(assetId);
  if (!MptIssuanceIdStruct.is(assetReference)) {
    throw new Error(`Invalid MPT issuance id: ${assetReference}`);
  }
  return assetReference;
}

export function parseIouAsset(
  assetId: KnownCaip19IouAssetId,
): ReturnType<typeof parseIouAssetCodeIssuer> {
  const { assetReference } = parseCaipAssetType(assetId);
  return parseIouAssetCodeIssuer(assetReference);
}

export function groupAssetsByType(assetIds: KnownCaip19AssetIdOrSlip44Id[]): {
  iouAssetIds: KnownCaip19IouAssetId[];
  mptAssetIds: KnownCaip19MptAssetId[];
  slip44AssetIds: KnownCaip19Slip44Id[];
} {
  const iouAssetIds: KnownCaip19IouAssetId[] = [];
  const mptAssetIds: KnownCaip19MptAssetId[] = [];
  const slip44AssetIds: KnownCaip19Slip44Id[] = [];
  assetIds.forEach((assetId) => {
    if (isIouAssetId(assetId)) {
      iouAssetIds.push(assetId);
    } else if (isMptId(assetId)) {
      mptAssetIds.push(assetId);
    } else if (isSlip44Id(assetId)) {
      slip44AssetIds.push(assetId);
    }
  });
  return { iouAssetIds, mptAssetIds, slip44AssetIds };
}
