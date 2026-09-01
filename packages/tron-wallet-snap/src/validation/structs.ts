import {
  CaipAssetTypeStruct,
  KeyringRequestStruct,
  SolMethod,
  TrxAccountType,
} from '@metamask/keyring-api';
import { ExportAccountOptionsStruct } from '@metamask/keyring-api/v2';
import { UuidStruct } from '@metamask/snap-networks-utils';
import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  define,
  enums,
  integer,
  literal,
  nullable,
  object,
  optional,
  pattern,
  record,
  string,
  type,
  union,
  unknown,
} from '@metamask/superstruct';
import { TronWeb } from 'tronweb';

import { Network } from '../constants';
import { TronMultichainMethod } from '../handlers/keyring/keyring-types';
import {
  MaximumResourceCaipAssetTypeStruct,
  NativeCaipAssetTypeStruct,
  NftCaipAssetTypeStruct,
  ResourceCaipAssetTypeStruct,
  StakedCaipAssetTypeStruct,
  TokenCaipAssetTypeStruct,
} from '../services/assets/types';

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

export const NetworkStruct = enums(Object.values(Network));

/**
 * Validates createAccount options.
 * - entropySource: Optional string for the entropy source (UUID or ULID format)
 * - index: Optional non-negative integer for account derivation index
 */
export const CreateAccountOptionsStruct = optional(
  object({
    entropySource: optional(string()),
    index: optional(integer()),
    addressType: optional(enums([TrxAccountType.Eoa])),
    scope: optional(NetworkStruct),
    metamask: optional(
      object({
        correlationId: optional(string()),
      }),
    ),
  }),
);

export const GetAccounBalancesResponseStruct = record(
  CaipAssetTypeStruct,
  object({
    amount: PositiveNumberStringStruct,
    unit: string(),
  }),
);

export const ListAccountAssetsResponseStruct = array(CaipAssetTypeStruct);

export const SubmitRequestMethodStruct = enums(Object.values(SolMethod));

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

export const GetFeeForTransactionParamsStruct = object({
  transaction: string(),
  scope: enums(Object.values(Network)),
});

export const GetFeeForTransactionResponseStruct = object({
  value: nullable(PositiveNumberStringStruct),
});

/**
 * Validates a Tron private key: exactly 64 lowercase hexadecimal characters
 * (32 bytes without the 0x prefix).
 */
export const PrivateKeyHexStruct: Struct<string, null> = define(
  'PrivateKeyHex',
  (value) => {
    if (typeof value !== 'string') {
      return `Expected a string, but received: ${typeof value}`;
    }
    if (!/^[0-9a-f]{64}$/u.test(value)) {
      return 'Expected a 64-character lowercase hexadecimal private key';
    }
    return true;
  },
);

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
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/u,
);

const DERIVATION_PATH_REGEX = /^m\/44'\/195'/u;

export const ScopeStringStruct = enums(Object.values(Network));

/**
 * Validates a Tron derivation path following the format: m/44'/195'/...
 */
export const DerivationPathStruct = pattern(string(), DERIVATION_PATH_REGEX);

/**
 * Validates an ISO 8601 date string.
 */
export const Iso8601Struct = pattern(
  string(),
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u,
);

export const TronAddressStruct: Struct<string, null> = define(
  'TronAddress',
  (value) => {
    if (typeof value !== 'string') {
      return `Expected a string, but received: ${typeof value}`;
    }

    // Use TronWeb's built-in address validation
    const isValidAddress = TronWeb.isAddress(value);

    if (!isValidAddress) {
      return 'Invalid Tron address format';
    }

    return true;
  },
);

export const TronCaipAssetTypeStruct = union([
  NativeCaipAssetTypeStruct,
  StakedCaipAssetTypeStruct,
  TokenCaipAssetTypeStruct,
  NftCaipAssetTypeStruct,
  ResourceCaipAssetTypeStruct,
  MaximumResourceCaipAssetTypeStruct,
]) as Struct<string, null>;

/**
 * Multichain API - signMessage validation (params only)
 */
export const SignMessageRequestStruct = object({
  address: TronAddressStruct,
  message: Base64Struct,
});

export const SignMessageResponseStruct = object({
  signature: string(),
});

/**
 * Multichain API - signTransaction validation (params only)
 */
export const SignTransactionRequestStruct = object({
  address: TronAddressStruct,
  transaction: object({
    rawDataHex: string(),
    type: string(),
  }),
});

/**
 * Full signMessage request object (method + params)
 */
export const SignMessageRequestObjectStruct = object({
  method: literal(TronMultichainMethod.SignMessage),
  params: SignMessageRequestStruct,
});

/**
 * Full signTransaction request object (method + params)
 */
export const SignTransactionRequestObjectStruct = object({
  method: literal(TronMultichainMethod.SignTransaction),
  params: SignTransactionRequestStruct,
});

/**
 * Keyring Request validation for submitRequest
 */
export const TronKeyringRequestStruct = object({
  ...KeyringRequestStruct.schema, // Re-use default schema as a base.
  scope: ScopeStringStruct,
  request: union([
    SignMessageRequestObjectStruct,
    SignTransactionRequestObjectStruct,
  ]),
});

export type TronWalletKeyringRequest = Infer<typeof TronKeyringRequestStruct>;

/**
 * Validation struct for resolveAccountAddress request
 * Only validates the presence of method and params
 * (other fields like jsonrpc, id, and extra params are allowed)
 */
export const ResolveAccountAddressRequestStruct = type({
  method: enums(Object.values(TronMultichainMethod)),
  params: record(string(), unknown()),
});

/**
 * Validation struct for resolveAccountAddress response
 */
export const ResolveAccountAddressResponseStruct = pattern(
  string(),
  /^[a-zA-Z0-9]+:[a-zA-Z0-9]+:[a-zA-Z0-9]+$/u,
);
