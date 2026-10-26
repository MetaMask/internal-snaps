import type { FetchPolicyError } from '@metamask/snap-networks-utils';
import {
  createFetchPolicyError,
  FetchPolicyErrorName,
} from '@metamask/snap-networks-utils';
import { ensureError } from '@metamask/utils';
import { NetworkError, Networks, NotFoundError } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import { BASE_FEE } from '../../constants';
import { toSmallestUnit } from '../../utils';
import { parseScValToNative } from '../transaction/xdrParser';

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
  if (!(caip2ChainId in StellarNetwork)) {
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
 * @param body - A parsed HTTP response body.
 * @returns Whether the body is empty (no body, or an empty / whitespace-only string).
 */
export function isEmptyHttpBody(body: unknown): boolean {
  return (
    body === undefined ||
    body === null ||
    (typeof body === 'string' && body.trim() === '')
  );
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
    // Horizon answers a missing account with a JSON problem body. An empty 404 comes from
    // something in front of Horizon (e.g. a provider router rejecting a mis-routed,
    // HTTP/2-coalesced request): it says nothing about the account, so it must not be read as
    // "unfunded" (which reports a confident zero balance).
    return !isEmptyHttpBody(error.getResponse());
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

/**
 * Maps an error thrown by the Horizon / Soroban RPC SDK clients on a read to the shape the
 * fetch policy decides on, keeping the original error as `cause` so callers can still
 * classify it (see {@link unwrapFetchPolicyError}).
 *
 * - A confirmed missing account (Horizon 404 with a body, or the RPC "Account not found"
 * error) is a definitive 404: never retried nor sent to a fallback.
 * - An empty Horizon 404 is treated as a transport failure (see {@link isAccountNotFoundError}).
 * - A Horizon error response carrying a numeric `status` keeps it (5xx / 429 are retried).
 * - Anything else (e.g. a bare `Failed to fetch` / `Network Error`) is a network failure.
 *
 * @param error - The SDK error.
 * @param accountAddress - The account the read was about, if any.
 * @returns The error in the fetch policy shape.
 */
export function toStellarFetchPolicyError(
  error: unknown,
  accountAddress?: string,
): FetchPolicyError {
  const { message } = ensureError(error);
  if (
    accountAddress !== undefined &&
    isAccountNotFoundError(error, accountAddress)
  ) {
    return createFetchPolicyError(message, { httpStatus: 404, cause: error });
  }
  if (error instanceof NetworkError && !(error instanceof NotFoundError)) {
    const status = (error.getResponse() as { status?: unknown } | undefined)
      ?.status;
    if (typeof status === 'number') {
      return createFetchPolicyError(message, {
        httpStatus: status,
        cause: error,
      });
    }
  }
  return createFetchPolicyError(message, {
    name: FetchPolicyErrorName.Network,
    cause: error,
  });
}

/**
 * Returns the SDK error a {@link toStellarFetchPolicyError} error wraps, or the error itself.
 *
 * @param error - The error thrown by `executeWithFetchPolicy` / `withEndpointFallback`.
 * @returns The original SDK error when available.
 */
export function unwrapFetchPolicyError(error: unknown): unknown {
  if (
    error instanceof Error &&
    ((error as FetchPolicyError).httpStatus !== undefined ||
      error.name === FetchPolicyErrorName.Network) &&
    error.cause !== undefined
  ) {
    return error.cause;
  }
  return error;
}
