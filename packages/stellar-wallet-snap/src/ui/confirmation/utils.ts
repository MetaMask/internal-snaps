import type { TransactionSecurityProperties } from '@metamask/snap-networks-utils';
import {
  getTransactionSecurityProperties,
  SECURITY_ALERT_LOADING_RESPONSE,
  TransactionSecurityPropertiesStruct,
} from '@metamask/snap-networks-utils';
import type { DialogResult, GetPreferencesResult } from '@metamask/snaps-sdk';
import type { CaipAccountId, Json } from '@metamask/utils';
import { isObject } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip19AssetIdOrSlip44Id } from '../../api';
import { KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import type { UserInputUiEventHandler } from '../../handlers/user-input/api';
import { getNativeAssetMetadata } from '../../services/asset-metadata/utils';
import type { ReadableOperationField } from '../../services/transaction/OperationMapper';
import { parseOperationAssetReferenceSafe } from '../../services/transaction/utils';
import type { Locale } from '../../utils';
import {
  FALLBACK_LANGUAGE,
  getInterfaceContextIfExists,
  getPreferences,
  parseClassicAssetCodeIssuer,
  toDisplayBalance,
  withInterfaceLock,
} from '../../utils';
import { xlmIcon } from '../images';
import { ContextWithSecurityScanStruct, FetchStatus } from './api';
import type { FeeData, TransactionConfirmationResult } from './api';

const NetworkName = {
  [KnownCaip2ChainId.Mainnet]: 'Stellar Mainnet',
  [KnownCaip2ChainId.Testnet]: 'Stellar Testnet',
};

/**
 * Converts a CAIP-2 chain id to a network name string.
 *
 * @param scope - The CAIP-2 chain id.
 * @returns The network name string.
 */
export function getNetworkName(scope: KnownCaip2ChainId): string {
  return NetworkName[scope] ?? 'Unknown';
}

/**
 * Display labels for known, non-URL origins, keyed by their lowercased raw value.
 * Lets us show a friendly name for the internal MetaMask origin and WalletConnect
 * channels instead of an empty/hidden origin row.
 */
const KNOWN_ORIGIN_LABELS: Record<string, string> = {
  metamask: 'MetaMask',
  'wallet-connect': 'WalletConnect',
};

/**
 * Formats an origin for display purposes.
 *
 * @param origin - The origin string to format (e.g., 'metamask', 'https://example.com').
 * @returns The formatted origin string. `'Unknown'` for undefined/empty origins, a
 * friendly label for known origins (e.g. `'MetaMask'`, `'WalletConnect'`), the
 * hostname for http(s) URLs, or an empty string for any other value (e.g. a
 * WalletConnect channelId or a non-http URL) so the UI hides the origin row.
 */
export function formatOrigin(origin: string | undefined): string {
  if (!origin) {
    return 'Unknown';
  }

  const knownLabel = KNOWN_ORIGIN_LABELS[origin.toLowerCase()];
  if (knownLabel) {
    return knownLabel;
  }

  // Try to extract hostname from URL
  try {
    const url = new URL(origin);
    return isHttpOrHttpsUrl(url) ? url.hostname : '';
  } catch {
    return '';
  }
}

/**
 * Checks whether a parsed URL uses an HTTP(S) protocol.
 *
 * @param url - The parsed URL to check.
 * @returns Whether the URL uses HTTP or HTTPS.
 */
function isHttpOrHttpsUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/**
 * Gets the locale from the preferences.
 *
 * @returns The locale.
 */
export async function getLocale(): Promise<Locale> {
  return (
    ((await getPreferences()
      .then((preferences) => preferences.locale)
      .catch(() => FALLBACK_LANGUAGE)) as Locale) ?? FALLBACK_LANGUAGE
  );
}

/**
 * Gets the preferences with fallback.
 *
 * @returns The preferences with fallback.
 */
export async function getPreferencesWithFallback(): Promise<GetPreferencesResult> {
  return getPreferences().catch(() => ({
    locale: FALLBACK_LANGUAGE,
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: true,
    simulateOnChainActions: true,
    useTokenDetection: true,
    batchCheckBalances: true,
    displayNftMedia: true,
    useNftDetection: true,
    useExternalPricingData: true,
    showTestnets: true,
  }));
}

/**
 * Gets the account explorer url for a given account address.
 *
 * @param address - The account address.
 * @returns The account explorer url.
 */
export function getAccountExplorerUrl(address: string): string {
  return `${
    AppConfig.networks[AppConfig.selectedNetwork].explorerBaseUrl
  }/account/${address}`;
}

/**
 * Gets the classic asset explorer url for a given asset reference.
 *
 * @param assetReference - The asset reference.
 * @returns The classic asset explorer url.
 */
export function getClassicAssetExplorerUrl(assetReference: string): string {
  return `${
    AppConfig.networks[AppConfig.selectedNetwork].explorerBaseUrl
  }/asset/${assetReference}`;
}

/**
 * Gets the SEP-41 asset explorer url for a given asset reference.
 *
 * @param assetReference - The asset reference.
 * @returns The SEP-41 asset explorer url.
 */
export function getSepAssetExplorerUrl(assetReference: string): string {
  return `${
    AppConfig.networks[AppConfig.selectedNetwork].explorerBaseUrl
  }/contract/${assetReference}`;
}

/**
 * Gets the account name for a given CAIP-2 chain id and address.
 *
 * @param scope - The CAIP-2 chain id.
 * @param address - The account address.
 * @returns The account name.
 */
export function getAccountName(
  scope: KnownCaip2ChainId,
  address: string,
): CaipAccountId {
  return `${scope}:${address}`;
}

/**
 * Formats the fee data for a given CAIP-2 chain id and amount in stroops.
 * It converts the amount in stroops to the native asset amount and returns the fee data.
 *
 * @param scope - The CAIP-2 chain id.
 * @param amountInStroops - The amount in stroops.
 * @returns The fee data that can be used to display the fee in the UI.
 */
export function formatFeeData(
  scope: KnownCaip2ChainId,
  amountInStroops: string,
): FeeData {
  const nativeAssetMetadata = getNativeAssetMetadata(scope);
  const amountInXlm = toDisplayBalance(new BigNumber(amountInStroops));
  return {
    assetId: nativeAssetMetadata.assetId,
    symbol: nativeAssetMetadata.symbol,
    iconUrl: nativeAssetMetadata.iconUrl,
    amount: amountInXlm,
  };
}

/**
 * Returns true while a fetch has not settled yet — either it hasn't started
 * (`Initial`) or it is actively in flight (`Fetching`).
 *
 * @param status - The fetch status to inspect.
 * @returns Whether the status represents an in-progress fetch.
 */
export function isFetchInProgress(status: FetchStatus): boolean {
  return status === FetchStatus.Initial || status === FetchStatus.Fetching;
}

/**
 * Determines whether the remote (Blockaid) transaction scan is still loading.
 *
 * @param params - Scan state.
 * @param params.scanFetchStatus - Latest transaction scan fetch status.
 * @returns True while the remote scan is still in flight.
 */
export function isRemoteTransactionScanLoading(params: {
  scanFetchStatus: FetchStatus;
}): boolean {
  // We only block while the scan is still running. A malicious result no longer
  // disables confirm: per product/Blockaid, the user must always retain a
  // "proceed anyway" path, gated behind the malicious acknowledgement screen
  // (see the shared `requiresMaliciousAcknowledgement`).
  return params.scanFetchStatus === FetchStatus.Fetching;
}

/**
 * Determines whether transaction scan UI should be shown for the current preferences.
 *
 * @param preferences - User preferences controlling scan behavior.
 * @returns True when either security validation alerts or simulation alerts are enabled.
 */
export function hasEnabledTransactionScan(
  preferences: GetPreferencesResult,
): boolean {
  return preferences.useSecurityAlerts || preferences.simulateOnChainActions;
}

/**
 * Determines whether local background re-validation found the pending
 * transaction is no longer valid.
 *
 * @param transactionsFetchStatus - Latest transaction re-validation fetch status.
 * @returns True when local re-validation has failed.
 */
export function isLocalTransactionValidationFailed(
  transactionsFetchStatus: FetchStatus | undefined,
): boolean {
  return transactionsFetchStatus === FetchStatus.Error;
}

/**
 * Single source of truth for whether the confirm action must be disabled.
 *
 * Combines the remote-scan and local-re-validation guards so the confirmation
 * footer and the malicious-acknowledgement proceed handler can never drift
 * apart. Flows without background re-validation (e.g. dapp sign-transaction)
 * simply omit `transactionsFetchStatus`, which is treated as "not blocked".
 *
 * @param params - Latest fetch state.
 * @param params.scanFetchStatus - Latest transaction scan fetch status.
 * @param params.transactionsFetchStatus - Latest transaction re-validation fetch status.
 * @returns True when the confirm action should be disabled.
 */
export function shouldDisableConfirmation(params: {
  scanFetchStatus?: FetchStatus;
  transactionsFetchStatus?: FetchStatus;
}): boolean {
  return (
    isRemoteTransactionScanLoading({
      scanFetchStatus: params.scanFetchStatus ?? FetchStatus.Initial,
    }) || isLocalTransactionValidationFailed(params.transactionsFetchStatus)
  );
}

/**
 * The single banner the confirmation screen may show at the top.
 *
 * The transaction-validation banner and the Blockaid scan banner are mutually
 * exclusive: only one is ever rendered, and validation takes priority.
 */
export const ConfirmationBanner = {
  None: 'none',
  TransactionValidation: 'transaction-validation',
  TransactionScan: 'transaction-scan',
} as const;

export type ConfirmationBanner =
  (typeof ConfirmationBanner)[keyof typeof ConfirmationBanner];

/**
 * Resolves which top-of-screen banner the confirmation should display.
 *
 * Priority is explicit: a failed background re-validation (the transaction is no
 * longer valid) outranks the Blockaid scan alert, so the two never stack. The
 * scan banner is only considered when the user has security or simulation alerts
 * enabled; the shared `TransactionAlert` component (via
 * {@link ConfirmationAlerts}) still decides its own content based on the scan
 * result.
 *
 * @param params - Validation and scan-preference state.
 * @param params.preferences - User preferences controlling scan behavior.
 * @param params.transactionsFetchStatus - Latest transaction re-validation fetch status.
 * @returns The single banner to render.
 */
export function resolveConfirmationBanner(params: {
  preferences: GetPreferencesResult;
  transactionsFetchStatus: FetchStatus | undefined;
}): ConfirmationBanner {
  const { preferences, transactionsFetchStatus } = params;

  // The two banners are gated asymmetrically by design, and this only resolves
  // which one wins the single slot; each component still decides whether it
  // actually renders:
  // - Validation is fail-only: re-validation starts optimistically (the tx was
  //   already validated at build time), so the banner exists solely on Error.
  // - Scan is preference-driven: while scan prefs are on, TransactionAlert owns
  //   the full async lifecycle (in-progress -> result/error -> null for benign).
  if (isLocalTransactionValidationFailed(transactionsFetchStatus)) {
    return ConfirmationBanner.TransactionValidation;
  }

  if (hasEnabledTransactionScan(preferences)) {
    return ConfirmationBanner.TransactionScan;
  }

  return ConfirmationBanner.None;
}

/**
 * Display-friendly resolution of a Stellar operation `asset` reference.
 * Used by the confirmation UI to render assets and to look up prices.
 */
export type ResolvedAssetDisplay = {
  /** CAIP-19 id used to key into the prices map. */
  assetId: KnownCaip19AssetIdOrSlip44Id;
  /** Short ticker (e.g. `XLM`, `USD`). */
  symbol: string;
  /** Bundled icon when known (native XLM only today). */
  iconUrl?: string;
  /** Explorer link for classic assets. */
  link?: string;
};

/**
 * Resolves an `OperationMapper` asset reference into the data required to display it.
 *
 * @param scope - CAIP-2 chain of the transaction.
 * @param assetReference - Either `'native'` or a classic `CODE-ISSUER` / `CODE:ISSUER` string.
 * @returns The resolved display data, or `null` when the reference cannot be parsed
 * (e.g. liquidity pool ids that arrive on `setTrustLineFlags` / `revoke*Sponsorship`).
 */
export function resolveAssetDisplay(
  scope: KnownCaip2ChainId,
  assetReference: string,
): ResolvedAssetDisplay | null {
  const assetId = parseOperationAssetReferenceSafe(scope, assetReference);
  if (assetId === null) {
    return null;
  }
  if (assetReference === 'native') {
    const native = getNativeAssetMetadata(scope);
    return {
      assetId,
      symbol: native.symbol,
      // Use the bundled SVG instead of the remote token-icon URL
      iconUrl: xlmIcon,
    };
  }
  // Safe: parseOperationAssetReferenceSafe returned non-null for a non-native ref,
  // so the reference is a parseable classic CODE-ISSUER pair.
  const { assetCode } = parseClassicAssetCodeIssuer(assetReference);
  // TODO: resolve classic-asset iconUrl via AssetMetadataService once
  // integrated, instead of letting <AssetIcon> fall back to question-mark.
  return {
    assetId,
    symbol: assetCode,
    link: getClassicAssetExplorerUrl(assetReference),
  };
}

/**
 * Gets a parameter from a list of ReadableOperationField.
 *
 * @param params - The parameters to search through.
 * @param key - The key of the parameter to get.
 * @returns The value of the parameter, or `null` if the parameter is not found.
 */
export function getParam<Response extends Json>(
  params: ReadableOperationField[],
  key: string,
): Response | null {
  const value = params.find((param) => param.key === key)?.value;
  return (value ?? null) as Response | null;
}

/**
 * Reads a trimmed memo from confirmation interface context (UI-owned, not RPC params).
 *
 * @param context - The interface context.
 * @returns Trimmed memo string, or `null` when missing/blank.
 */
export function getMemoFromContext(
  context: Record<string, Json> | null | undefined,
): string | null {
  if (typeof context?.memo === 'string' && context.memo.trim()) {
    return context.memo.trim();
  }
  return null;
}

/**
 * Keys rendered above the flat param list (authorized address, contract, function).
 */
export const INVOCATION_HEADER_KEYS = new Set([
  'authorizedAddress',
  'contractId',
  'functionName',
]);

/**
 * Remaining confirmation rows after the invocation header.
 *
 * @param params - Mapped operation or authorization fields.
 * @returns Params that should render line-by-line.
 */
export function getInvocationDetailParams(
  params: ReadableOperationField[],
): ReadableOperationField[] {
  return params.filter((param) => !INVOCATION_HEADER_KEYS.has(param.key));
}

/**
 * Runs a handler under the interface lock with the latest context.
 *
 * Memo save and malicious acknowledgement share this lock, so one write cannot
 * drop the other's context fields.
 *
 * @param handler - The handler to wrap.
 * @returns The protected handler.
 */
export function withLockedContext(
  handler: UserInputUiEventHandler,
): UserInputUiEventHandler {
  return async (options) =>
    withInterfaceLock(options.id, async () => {
      const context = await getInterfaceContextIfExists<Record<string, Json>>(
        options.id,
      );
      if (context) {
        await handler({ ...options, context });
      }
    });
}

/**
 * Returns the security properties of the verdict the dialog showed. Returns
 * `undefined` when there is nothing to report: there is no context, the dialog
 * did not open with a scan, security alerts were disabled, or the scan was
 * paused by a failed transaction validation before it produced a verdict.
 *
 * While no verdict is stored yet, a scan that is still running is reported as
 * `Loading`. Once a verdict is stored, a re-scan in progress reports that
 * verdict. Otherwise the scan is reported as it is. A failed refresh keeps the
 * stored verdict, and the dialog may show that verdict as unavailable, so the
 * two can differ.
 *
 * @param context - The confirmation context at the time of the decision, or `null` when the dialog gave none.
 * @returns The security properties, or `undefined`.
 */
export function getSecurityProperties(
  context: Record<string, Json> | null,
): TransactionSecurityProperties | undefined {
  const isLocalValidationFailed = isLocalTransactionValidationFailed(
    context?.transactionsFetchStatus as FetchStatus | undefined,
  );

  if (
    // The scan fields are only stored when the dialog opened with a scan.
    !ContextWithSecurityScanStruct.is(context) ||
    !context.preferences.useSecurityAlerts ||
    // The scan was paused, not run: a failed transaction validation stops it
    // before any verdict exists. The user never saw a verdict and the scan did
    // not fail, so there is nothing to report.
    (isLocalValidationFailed && !context.scan?.validation)
  ) {
    return undefined;
  }

  const isLoading =
    isFetchInProgress(context.scanFetchStatus) && !context.scan?.validation;

  const scan = isLoading
    ? SECURITY_ALERT_LOADING_RESPONSE
    : (context.scan ?? null);

  return getTransactionSecurityProperties(scan);
}

/**
 * Builds the value that a confirmation event resolves its interface with.
 *
 * The interface context holds much more than the handlers need, so only the
 * decision, the security verdict, and the caller's `customContext` are passed
 * on. Each caller decides what extra data its flow resolves with, for example
 * the confirm-send flow passes the saved memo. Fields with no value are left
 * out, because the resolved value must be JSON.
 *
 * @param confirmed - Whether the user confirmed the transaction.
 * @param context - The latest interface context, read under the interface lock.
 * @param customContext - Extra flow-specific fields to resolve the interface with.
 * @returns The value to resolve the interface with.
 */
export function buildResolveResult(
  confirmed: boolean,
  context: Record<string, Json> | null | undefined,
  customContext: Record<string, Json> = {},
): Json {
  const securityProperties = getSecurityProperties(context ?? null);

  return {
    confirmed,
    ...(securityProperties ? { securityProperties } : {}),
    ...customContext,
  };
}

/**
 * Reads the value that a transaction confirmation dialog resolved with.
 *
 * A bare `true` is a confirmation with nothing else. Any other value that is
 * not an object, such as a dismissed dialog, is a rejection. In an object, a
 * truthy `confirmed` is a confirmation. A memo or security verdict of the wrong
 * shape is left out.
 *
 * @param value - The value the dialog resolved with.
 * @returns The decision, with the memo and security verdict when there are any.
 */
export function parseTransactionConfirmationResult(
  value: DialogResult,
): TransactionConfirmationResult {
  // Bare `true` from the Snap dialog: confirmed, and nothing else was returned.
  if (value === true) {
    return { confirmed: true };
  }

  // Cancel, dismiss, or a non-object payload: the user did not confirm.
  if (!isObject(value)) {
    return { confirmed: false };
  }

  const memo = typeof value.memo === 'string' ? value.memo.trim() : '';

  const securityProperties = TransactionSecurityPropertiesStruct.is(
    value.securityProperties,
  )
    ? { securityProperties: value.securityProperties }
    : {};

  return {
    confirmed: Boolean(value.confirmed),
    ...(memo ? { memo } : {}),
    ...securityProperties,
  };
}
