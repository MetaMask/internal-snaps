/* eslint-disable @typescript-eslint/naming-convention */

import { DEFAULT_METAMASK_ORIGIN } from '../../utils/originPermissions/createOriginPermissions';

/**
 * Scan options recognized by the Security Alerts API scan endpoints.
 *
 * `simulation` requests an on-chain simulation of the transaction (asset
 * diffs); `validation` requests a security verdict.
 */
export const SecurityAlertsScanOption = {
  Simulation: 'simulation',
  Validation: 'validation',
} as const;

export type SecurityAlertsScanOption =
  (typeof SecurityAlertsScanOption)[keyof typeof SecurityAlertsScanOption];

/** Status of a completed security scan. */
export const SecurityAlertsScanStatus = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
} as const;

export type SecurityAlertsScanStatus =
  (typeof SecurityAlertsScanStatus)[keyof typeof SecurityAlertsScanStatus];

/**
 * Verdicts emitted by the Security Alerts API validation.
 *
 * Shared by all network snaps so scan results and analytics agree on the
 * verdict vocabulary.
 */
export const SecurityAlertResponse = {
  Benign: 'Benign',
  Warning: 'Warning',
  Malicious: 'Malicious',
} as const;

export type SecurityAlertResponse =
  (typeof SecurityAlertResponse)[keyof typeof SecurityAlertResponse];

/**
 * JSON body fields shared by every Security Alerts API scan request.
 *
 * Chain-specific payloads (the transaction itself, its encoding, and the
 * metadata shape) are added by each chain's client on top of this base.
 */
export type SecurityAlertsScanRequestBase = {
  /**
   * The scanned account's address, in the chain's native format. The snake
   * case matches the Security Alerts API wire format.
   */
  account_address: string;
  /** The Security Alerts API chain identifier (e.g. `mainnet`, `pubnet`). */
  chain: string;
  /** The requested scan options. */
  options?: string[];
};

/**
 * The URL substituted for the MetaMask in-app origin in scan request
 * metadata, since the in-app browser reports no dapp URL.
 */
export const METAMASK_ORIGIN_URL = 'https://metamask.io';

/**
 * Normalizes a dapp origin for scan request metadata.
 *
 * The MetaMask in-app browser reports the pseudo-origin `metamask`, which is
 * not a usable URL; it is mapped to the MetaMask site. Other origins are
 * returned unchanged.
 *
 * @param origin - The origin of the request.
 * @returns The normalized origin.
 */
export function normalizeScanOrigin(origin: string): string {
  return origin === DEFAULT_METAMASK_ORIGIN ? METAMASK_ORIGIN_URL : origin;
}
