import type { FetchPolicyError } from '@metamask/snap-networks-utils';
import {
  createFetchPolicyError,
  FetchPolicyErrorName,
  parseRetryAfter,
} from '@metamask/snap-networks-utils';
import { ensureError } from '@metamask/utils';
import { Networks, NotFoundError } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import { BASE_FEE } from '../../constants';
import { toSmallestUnit } from '../../utils';
import { parseScValToNative } from '../transaction/xdrParser';

type StellarTransportError = Error & {
  code?: string;
  response?: {
    headers?:
      | { get: (name: string) => string | null }
      | Record<string, unknown>;
    status?: number;
  };
};

type JsonRpcError = {
  code: number;
  message: string;
};

const SOROBAN_ACCOUNT_NOT_FOUND_PREFIX = 'Account not found: ';
const SDK_TIMEOUT_MESSAGE_PATTERN = /^timeout of \d+\s*ms exceeded$/iu;

const isJsonRpcError = (error: unknown): error is JsonRpcError => {
  const candidate = error as Partial<JsonRpcError> | null;
  return (
    typeof candidate?.code === 'number' && typeof candidate.message === 'string'
  );
};

/**
 * Converts Stellar SDK transport failures to the shared fetch-policy shape.
 *
 * @param error - Error thrown by the Stellar SDK HTTP client.
 * @returns A policy-compatible error.
 */
export function toFetchPolicyError(error: unknown): FetchPolicyError {
  if (isJsonRpcError(error)) {
    return createFetchPolicyError(error.message, { cause: error });
  }

  if (!(error instanceof Error)) {
    return createFetchPolicyError('Network request failed', {
      name: FetchPolicyErrorName.Network,
      cause: error,
    });
  }

  if (
    error instanceof NotFoundError ||
    error.message.startsWith(SOROBAN_ACCOUNT_NOT_FOUND_PREFIX)
  ) {
    return createFetchPolicyError(error.message, {
      httpStatus: 404,
      cause: error,
    });
  }

  const transportError = error as StellarTransportError;
  const { response } = transportError;
  if (response?.status !== undefined) {
    const getHeader = (response.headers as { get?: unknown } | undefined)?.get;
    const retryAfter =
      typeof getHeader === 'function'
        ? getHeader.call(response.headers, 'Retry-After')
        : (response.headers as Record<string, unknown> | undefined)?.[
            'retry-after'
          ];
    return createFetchPolicyError(error.message, {
      httpStatus: response.status,
      retryAfterMs: parseRetryAfter(retryAfter),
      cause: error,
    });
  }

  const isTimeout =
    error.name === FetchPolicyErrorName.Timeout ||
    transportError.code === 'ECONNABORTED' ||
    SDK_TIMEOUT_MESSAGE_PATTERN.test(error.message);

  return createFetchPolicyError(error.message, {
    name: isTimeout
      ? FetchPolicyErrorName.Timeout
      : FetchPolicyErrorName.Network,
    cause: error,
  });
}

/**
 * Restores an SDK error wrapped for policy classification.
 *
 * @param error - The error emitted after policy execution.
 * @returns Its original cause, when present.
 */
export function unwrapFetchPolicyError(error: unknown): unknown {
  return error instanceof Error && error.cause !== undefined
    ? error.cause
    : error;
}

const StellarNetwork: Record<KnownCaip2ChainId, Networks> = {
  [KnownCaip2ChainId.Mainnet]: Networks.PUBLIC,
  [KnownCaip2ChainId.Testnet]: Networks.TESTNET,
};

/**
 * Returns the Stellar network passphrase for the given scope (e.g. for transaction building).
 *
 * @param caip2ChainId - The CAIP-2 chain ID.
 * @returns The Stellar Networks passphrase.
 * @throws {Error} If the scope is not supported.
 */
export function caip2ChainIdToNetwork(
  caip2ChainId: KnownCaip2ChainId,
): Networks {
  if (!Object.hasOwn(StellarNetwork, caip2ChainId)) {
    throw new Error(`Network not found for caip2ChainId: ${caip2ChainId}`);
  }
  return StellarNetwork[caip2ChainId];
}

/**
 * Resolves a Stellar network passphrase to the corresponding CAIP-2 chain ID.
 *
 * @param network - The network name or Stellar Networks enum value.
 * @returns The CAIP-2 chain ID for the network.
 * @throws {Error} If the network is not recognized.
 */
export function networkToCaip2ChainId(
  network: string | Networks,
): KnownCaip2ChainId {
  const networkValue =
    typeof network === 'string' ? (network as Networks) : network;
  const caip2ChainId = (
    Object.keys(StellarNetwork) as KnownCaip2ChainId[]
  ).find((key) => StellarNetwork[key] === networkValue);
  if (!caip2ChainId) {
    throw new Error(`Caip2ChainId not found for network: ${network}`);
  }
  return caip2ChainId;
}

/**
 * Normalizes a single Stellar multicall `exec` result cell to a non-negative {@link BigNumber}.
 *
 * @param value - Native value from `scValToNative` for one invocation result.
 * @returns Parsed balance, or `null` when the cell is missing or not a supported numeric shape.
 */
export function sep41MulticallCellToBalance(value: unknown): BigNumber | null {
  if (
    typeof value === 'bigint' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    try {
      return parseScValToNative(value);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Detects the error shape thrown by Soroban RPC `getAccount` / `getAccountEntry` when the account
 * ledger entry is missing (`Error` with message `Account not found: <G… address>`).
 *
 * @param error - Value caught from the RPC client.
 * @param accountAddress - Stellar account id that was requested.
 * @returns True when `error` matches the SDK missing-account message for this address.
 */
export function isAccountNotFoundError(
  error: unknown,
  accountAddress: string,
): boolean {
  if (error instanceof NotFoundError) {
    return true;
  }
  return ensureError(error).message === `Account not found: ${accountAddress}`;
}

/**
 * Multiplies the given fee by the given multiplier and caps the result at the maximum fee threshold.
 *
 * @param fee - The fee to multiply.
 * @param multiplier - The multiplier to multiply the fee by.
 * @returns The multiplied fee, capped at {@link AppConfig.transaction.maxFeeThresholdInXLM}.
 */
export function multiplyFee(fee: BigNumber, multiplier: number): BigNumber {
  const feeMultiplied = fee
    .multipliedBy(multiplier)
    .integerValue(BigNumber.ROUND_CEIL);

  return BigNumber.min(
    feeMultiplied,
    toSmallestUnit(new BigNumber(AppConfig.transaction.maxFeeThresholdInXLM)),
  );
}

/**
 * Computes the per-operation inclusion fee from the Stellar network base fee (or protocol minimum).
 *
 * @param baseFee - Stellar network base fee in stroops; defaults to {@link BASE_FEE}.
 * @returns Inclusion fee in stroops, scaled by {@link AppConfig.transaction.baseFeeMultiplier}
 * and capped at {@link AppConfig.transaction.maxFeeThresholdInXLM}.
 */
export function baseInclusionFee(
  baseFee: BigNumber | number = BASE_FEE,
): BigNumber {
  return multiplyFee(
    new BigNumber(baseFee),
    AppConfig.transaction.baseFeeMultiplier,
  );
}
