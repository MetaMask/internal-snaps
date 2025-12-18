import {
  CaipAssetTypeStruct,
  KeyringRequestStruct,
  SolMethod,
  TrxAccountType,
} from '@metamask/keyring-api';
import type { Infer, Struct } from '@metamask/superstruct';
import {
  array,
  define,
  enums,
  integer,
  literal,
  min,
  nonempty,
  nullable,
  number,
  object,
  optional,
  pattern,
  record,
  refine,
  string,
  type,
  union,
  unknown,
} from '@metamask/superstruct';
import { TronWeb } from 'tronweb';

import { Network } from '../constants';
import { TronMultichainMethod } from '../handlers/keyring-types';
import {
  MaximumResourceCaipAssetTypeStruct,
  NativeCaipAssetTypeStruct,
  NftCaipAssetTypeStruct,
  ResourceCaipAssetTypeStruct,
  StakedCaipAssetTypeStruct,
  TokenCaipAssetTypeStruct,
} from '../services/assets/types';

// create a uuid validation
export const UuidStruct = pattern(
  string(),
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
);

export const PositiveNumberStringStruct = pattern(
  string(),
  /^(?!0\d)(\d+(\.\d+)?)$/u,
);

/**
 * Validates that a string is a valid and safe URL.
 *
 * It rejects:
 * - Non-HTTP/HTTPS/WSS protocols
 * - Malformed URL format or incorrect protocol format
 * - Invalid hostname format (must follow proper domain naming conventions)
 * - Protocol pollution attempts (backslashes, @ symbol, %2f@, %5c@)
 * - Invalid hostname characters (backslashes, @ symbol, forward slashes, encoded forward slashes)
 * - Directory traversal attempts (../, ..%2f, ..%2F)
 *
 * Dangerous patterns including:
 * - HTML tags.
 * - JavaScript protocol.
 * - Data URI scheme.
 * - Template injection (${...}, #{...}).
 * - Command injection (|, ;).
 * - CRLF injection.
 * - URL credential injection.
 * - SQL injection attempts.
 * - Open redirect parameters.
 * - Non-printable characters.
 */
export const UrlStruct = refine(string(), 'safe-url', (value) => {
  try {
    // Basic URL validation
    const url = new URL(value);

    // Protocol check
    const supportedProtocols = ['http:', 'https:', 'wss:'];
    if (!supportedProtocols.includes(url.protocol)) {
      return `URL must use one of the following protocols: ${supportedProtocols.join(', ')}`;
    }

    // Validate URL format
    if (!value.match(/^(https?|wss):\/\/[^/]+\/?/u)) {
      return 'Malformed URL - incorrect protocol format';
    }

    // Validate hostname format. Accepts localhost and ports (needed for tests)
    const hostname = url.hostname.toLowerCase();
    if (
      hostname !== 'localhost' &&
      (!hostname.includes('.') ||
        !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/u.test(
          hostname,
        ))
    ) {
      return 'Invalid hostname format';
    }

    // Check for protocol pollution in the entire URL
    const decodedValue = decodeURIComponent(value.toLowerCase());
    if (
      value.includes('\\') ||
      value.includes('@') ||
      decodedValue.includes('\\') ||
      decodedValue.includes('@') ||
      value.toLowerCase().includes('%2f@') ||
      value.toLowerCase().includes('%5c@')
    ) {
      return 'URL contains protocol pollution attempts';
    }

    // Additional hostname safety check for protocol pollution
    const decodedHostname = decodeURIComponent(hostname);
    if (
      hostname.includes('\\') ||
      hostname.includes('@') ||
      decodedHostname.includes('/') ||
      hostname.toLowerCase().includes('%2f')
    ) {
      return 'Invalid hostname characters detected';
    }

    // Check for directory traversal
    if (
      value.includes('../') ||
      value.includes('..%2f') ||
      value.includes('..%2F')
    ) {
      return 'Directory traversal attempts are not allowed';
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /<[^>]*>/u, // HTML tags
      /javascript:/u, // JavaScript protocol
      /data:/u, // Data URI scheme
      /\\[@\\]/u, // Enhanced protocol pollution check
      /%2f@/u, // Protocol pollution
      /[^\x20-\x7E]/u, // Non-printable characters
      /\$\{.*?\}/u, // Template injection
      /#\{.*?\}/u, // Template injection
      /[|;]/u, // Command injection
      /%0[acd]|%0[acd]/u, // CRLF injection
      /\/\/\w+@/u, // URL credential injection
      // Enhanced SQL injection patterns
      /(?:[^a-z]|^)(?:union\s+(?:all\s+)?select|select\s+(?:.*\s+)?from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table|alter\s+table|create\s+table|exec(?:ute)?|union|where\s+[\d\w]\s*=\s*[\d\w]|\bor\b\s*[\d\w]\s*=\s*[\d\w])/iu,
      /'.*?(?:OR|UNION|SELECT|FROM|WHERE).*?'/iu, // SQL injection
      /%27.*?(?:OR|UNION|SELECT|FROM|WHERE).*?(?:%27|')/iu, // URL-encoded SQL injection
      /%20(?:OR|UNION|SELECT|FROM|WHERE)%20/iu, // URL-encoded SQL keywords
      /[?&](?:url|redirect|next|return_to|return_url|goto|destination|continue|redirect_uri)=(?:[^&]*\/\/|https?:)/iu, // Open redirect parameters
      /[?&](?:url|redirect|next|return_to|return_url|goto|destination|continue|redirect_uri)=%(?:[^&]*\/\/|https?:)/iu, // URL-encoded open redirect parameters
    ];

    for (const patt of dangerousPatterns) {
      if (patt.test(decodedValue)) {
        return 'URL contains potentially malicious patterns';
      }
    }

    // Port validation (if present)
    if (url.port && !/^\d+$/u.test(url.port)) {
      return 'Invalid port number';
    }

    return true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return 'Invalid URL format';
  }
});

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

/**
 * Validates discoverAccounts parameters.
 * - scopes: Non-empty array of valid Tron network scopes (e.g., 'tron:728126428')
 * - entropySource: String for the entropy source (UUID or ULID format)
 * - groupIndex: Non-negative integer for the group index
 */
export const DiscoverAccountsStruct = object({
  scopes: nonempty(array(NetworkStruct)),
  entropySource: string(),
  groupIndex: min(number(), 0),
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
