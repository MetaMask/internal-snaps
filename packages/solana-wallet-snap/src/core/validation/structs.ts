import { CaipAssetTypeStruct, SolMethod } from '@metamask/keyring-api';
import { ExportAccountOptionsStruct } from '@metamask/keyring-api/v2';
import { UuidStruct } from '@metamask/snap-networks-utils';
import type { Struct } from '@metamask/superstruct';
import {
  array,
  define,
  enums,
  integer,
  nullable,
  object,
  optional,
  pattern,
  record,
  string,
} from '@metamask/superstruct';
import { address } from '@solana/kit';

import { Network } from '../constants/solana';

export const PositiveNumberStringStruct = pattern(
  string(),
  /^(?!0\d)(\d+(\.\d+)?)$/u,
);

/**
 * Keyring validations
 */
export const GetAccountStruct = object({
  accountId: UuidStruct,
});
export const DeleteAccountStruct = object({
  accountId: UuidStruct,
});
export const ListAccountAssetsStruct = object({
  accountId: UuidStruct,
});
export const GetAccountBalancesStruct = object({
  accountId: UuidStruct,
  assets: array(CaipAssetTypeStruct),
});
export const ListAccountTransactionsStruct = object({
  accountId: UuidStruct,
  pagination: object({
    limit: integer(),
    next: optional(nullable(string())),
  }),
});
export const ExportAccountRequestStruct = object({
  accountId: UuidStruct,
  options: optional(ExportAccountOptionsStruct),
});
export const GetAccounBalancesResponseStruct = record(
  CaipAssetTypeStruct,
  object({
    amount: PositiveNumberStringStruct,
    unit: string(),
  }),
);

export const ListAccountAssetsResponseStruct = array(CaipAssetTypeStruct);

export const SubmitRequestMethodStruct = enums(Object.values(SolMethod));

export const NetworkStruct = enums(Object.values(Network));

export const Curenc = enums([
  'btc',
  'eth',
  'ltc',
  'bch',
  'bnb',
  'eos',
  'xrp',
  'xlm',
  'link',
  'dot',
  'yfi',
  'usd',
  'aed',
  'ars',
  'aud',
  'bdt',
  'bhd',
  'bmd',
  'brl',
  'cad',
  'chf',
  'clp',
  'cny',
  'czk',
  'dkk',
  'eur',
  'gbp',
  'gel',
  'hkd',
  'huf',
  'idr',
  'ils',
  'inr',
  'jpy',
  'krw',
  'kwd',
  'lkr',
  'mmk',
  'mxn',
  'myr',
  'ngn',
  'nok',
  'nzd',
  'php',
  'pkr',
  'pln',
  'rub',
  'sar',
  'sek',
  'sgd',
  'thb',
  'try',
  'twd',
  'uah',
  'vef',
  'vnd',
  'zar',
  'xdr',
  'xag',
  'xau',
  'bits',
  'sats',
]);

/**
 * Validates if a string is Base58 encoded.
 * Base58 uses alphanumeric characters excluding 0, O, I, and l.
 */
export const Base58Struct: Struct<string, null> = define('Base58', (value) => {
  const BASE_58_PATTERN =
    /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/u;

  // First check if it's a string
  if (typeof value !== 'string') {
    return `Expected a string, but received: ${typeof value}`;
  }

  // Then check if it matches the Base58 pattern
  if (!BASE_58_PATTERN.test(value)) {
    return 'Expected a Base58 encoded string, but received a string with invalid characters';
  }

  return true;
});

/**
 * Validates if a string is Base64 encoded.
 * Base64 uses alphanumeric characters and +, /, and =.
 * Empty strings are rejected.
 */
export const Base64Struct = pattern(
  string(),
  /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
);

const DERIVATION_PATH_REGEX = /^m\/44'\/501'/u;

/**
 * Validates a Solana derivation path following the format: m/44'/501'/...
 */
export const DerivationPathStruct = pattern(string(), DERIVATION_PATH_REGEX);

/**
 * Validates an ISO 8601 date string.
 */
export const Iso8601Struct = pattern(
  string(),
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u,
);

export const SolanaAddressStruct: Struct<string, null> = define(
  'SolanaAddress',
  (value) => {
    if (typeof value !== 'string') {
      return `Expected a string, but received: ${typeof value}`;
    }

    try {
      address(value);
      return true;
    } catch (error) {
      return 'Invalid Solana address';
    }
  },
);
