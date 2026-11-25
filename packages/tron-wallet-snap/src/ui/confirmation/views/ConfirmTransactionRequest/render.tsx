import {
  DEFAULT_METAMASK_ORIGIN,
  getScanOptions,
  getTransactionSecurityProperties,
} from '@metamask/snap-networks-utils';
import type {
  ExtendedKeyringAccount,
  IStateManager,
  SecurityAlertsScanOption,
} from '@metamask/snap-networks-utils';
import type { Json } from '@metamask/snaps-sdk';
import type { Types as TronwebTypes } from 'tronweb';

import { isContractTypeSupported } from '../../../../clients/security-alerts-api/utils';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import snapContext from '../../../../context';
import type { AssetEntity } from '../../../../entities/assets';
import { BackgroundEventMethod } from '../../../../handlers/cronjob/cronjob';
import type { ComputeFeeResult } from '../../../../services/send/types';
import type { UnencryptedStateValue } from '../../../../services/state/stateTypes';
import type { TransactionScanService } from '../../../../services/transaction-scan/TransactionScanService';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { FetchStatus } from '../../../../types/snap';
import { assertTransactionStructure } from '../../../../validation/transaction';
import { withFeeIcons } from '../../utils/withFeeIcons';
import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import { CONFIRM_TRANSACTION_INTERFACE_NAME } from './types';
import type {
  ConfirmTransactionRequestContext,
  ConfirmTransactionRequestResult,
} from './types';

export const DEFAULT_CONFIRMATION_CONTEXT: ConfirmTransactionRequestContext = {
  scope: Network.Mainnet,
  fromAddress: null,
  toAddress: null,
  amount: null,
  fees: [],
  asset: {
    assetType: `${Network.Mainnet}/slip44:195`,
    keyringAccountId: '',
    network: Network.Mainnet,
    symbol: 'TRX',
    decimals: 6,
    rawAmount: '0',
    uiAmount: '0',
    iconUrl: '',
  },
  origin: DEFAULT_METAMASK_ORIGIN,
  networkImage: TRX_IMAGE_SVG,
  tokenPrices: {},
  tokenPricesFetchStatus: FetchStatus.Initial,
  scan: null,
  scanFetchStatus: FetchStatus.Initial,
  transactionRawData: null,
  accountType: '',
  preferences: {
    locale: 'en',
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: true,
    useExternalPricingData: true,
    simulateOnChainActions: true,
    useTokenDetection: true,
    batchCheckBalances: true,
    displayNftMedia: false,
    useNftDetection: false,
  },
};

/**
 * Render the ConfirmTransactionRequest UI and show a dialog resolving to the user's choice.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @param state - The state manager instance.
 * @param incomingContext - The initial context for the confirmation view.
 * @param incomingContext.scope - The network scope for the transaction.
 * @param incomingContext.fromAddress - The sender address.
 * @param incomingContext.toAddress - The recipient address.
 * @param incomingContext.amount - The amount to send (as a string).
 * @param incomingContext.fees - The detailed fee breakdown array.
 * @param incomingContext.asset - The asset involved in the transaction.
 * @param incomingContext.origin - The origin string to display.
 * @param incomingContext.accountType - The account type for analytics.
 * @param incomingContext.transactionRawData - The raw transaction data for security scanning.
 * @returns The user's decision and context data.
 */
export async function render(
  snapClient: SnapClient,
  state: IStateManager<UnencryptedStateValue>,
  incomingContext: IncomingContext,
): Promise<ConfirmTransactionRequestResult> {
  const { transactionScanService } = snapContext;
  const { transactionRawData } = incomingContext;

  assertTransactionStructure(transactionRawData);

  const context = await buildInitialContext(snapClient, incomingContext);
  const { preferences } = context;

  const scanOptions = getScanOptions(preferences);
  const scanEnabled = Boolean(transactionScanService) && scanOptions.length > 0;
  const validationEnabled = scanEnabled && preferences.useSecurityAlerts;

  if (!scanEnabled) {
    context.scanFetchStatus = FetchStatus.Fetched;
  }

  // Show the loading skeleton before the scan finishes.
  const id = await snapClient.createInterface(
    <ConfirmTransactionRequest context={context} />,
    context,
  );
  const dialogPromise = snapClient.showDialog(id);

  // Stored by name so the background refresh can find this dialog.
  const storeIdPromise = state.setKey(
    `mapInterfaceNameToId.${CONFIRM_TRANSACTION_INTERFACE_NAME}`,
    id,
  );

  if (scanEnabled) {
    const scanState = await runScan(
      transactionScanService,
      incomingContext,
      scanOptions,
    );
    context.scan = scanState.scan;
    context.scanFetchStatus = scanState.scanFetchStatus;
  }

  // The interface ID must be stored before the interface is updated.
  await storeIdPromise;

  // Pricing is disabled, so nothing will fetch prices: show them as fetched.
  if (!preferences.useExternalPricingData) {
    context.tokenPricesFetchStatus = FetchStatus.Fetched;
  }

  await snapClient.updateInterface(
    id,
    <ConfirmTransactionRequest context={context} />,
    context,
  );

  await scheduleRefreshes(snapClient, {
    pricesEnabled: preferences.useExternalPricingData,
    validityRefreshEnabled: Boolean(transactionScanService),
  });

  // Cleanup happens in the background refresh handler once it finds the interface gone.
  const result = await dialogPromise;

  return {
    result,
    context: {
      securityProperties: getSecurityProperties(
        validationEnabled,
        transactionRawData,
        context.scan,
      ),
    },
  };
}

/**
 * The transaction details that the send flow passes to `render`.
 */
type IncomingContext = {
  scope: Network;
  fromAddress: string;
  toAddress: string;
  amount: string;
  fees: ComputeFeeResult;
  asset: AssetEntity;
  origin: string;
  accountType: string;
  transactionRawData: TronwebTypes.Transaction['raw_data'];
};

/**
 * The scan fields that `render` merges into the context.
 */
type ScanState = Pick<
  ConfirmTransactionRequestContext,
  'scan' | 'scanFetchStatus'
>;

/**
 * Builds the context for the first render: the defaults, the incoming
 * transaction details and the user's preferences. Preferences fall back to
 * the defaults when they cannot be loaded. Prices and the scan are marked as
 * loading, and fee icons are resolved on a copy of the fees.
 *
 * @param snapClient - The SnapClient instance used to load preferences.
 * @param incomingContext - The transaction details passed to `render`.
 * @returns The initial confirmation context.
 */
export async function buildInitialContext(
  snapClient: SnapClient,
  incomingContext: IncomingContext,
): Promise<ConfirmTransactionRequestContext> {
  const preferences = await snapClient
    .getPreferences()
    .catch(() => DEFAULT_CONFIRMATION_CONTEXT.preferences);

  return {
    ...DEFAULT_CONFIRMATION_CONTEXT,
    ...incomingContext,
    fees: withFeeIcons(incomingContext.fees),
    preferences,
    transactionRawData: incomingContext.transactionRawData as unknown as Json,
    tokenPricesFetchStatus: FetchStatus.Loading, // Start as Loading (first fetch) not Fetching
    scanFetchStatus: FetchStatus.Loading, // Start as Loading (first fetch) not Fetching
  };
}

/**
 * Returns the security data to report for the scan that was shown. Without
 * validation, or for a contract type the scan service skips, no response is
 * stored, so there is no security data to report.
 *
 * @param validationEnabled - Whether validation was requested for this scan.
 * @param transactionRawData - The raw transaction data that was scanned.
 * @param scan - The scan result that was shown in the dialog.
 * @returns The security properties, or `undefined` if none apply.
 */
export function getSecurityProperties(
  validationEnabled: boolean,
  transactionRawData: TronwebTypes.Transaction['raw_data'],
  scan: ConfirmTransactionRequestContext['scan'],
): ReturnType<typeof getTransactionSecurityProperties> | undefined {
  if (!validationEnabled || !isContractTypeSupported(transactionRawData)) {
    return undefined;
  }

  return getTransactionSecurityProperties(scan);
}

/**
 * Scans the transaction with the given options. A failed scan is reported as
 * an error verdict rather than thrown.
 *
 * @param scanService - The transaction scan service.
 * @param incomingContext - The transaction details to scan.
 * @param options - The scan options to request.
 * @returns The scan result and its fetch status.
 */
async function runScan(
  scanService: TransactionScanService,
  incomingContext: IncomingContext,
  options: SecurityAlertsScanOption[],
): Promise<ScanState> {
  // Create a minimal account object for analytics tracking
  const scanAccount = {
    type: incomingContext.accountType,
    address: incomingContext.fromAddress,
  } as ExtendedKeyringAccount;

  try {
    const scan = await scanService.scanTransaction({
      accountAddress: incomingContext.fromAddress,
      transactionRawData: incomingContext.transactionRawData,
      origin: incomingContext.origin,
      scope: incomingContext.scope,
      options,
      account: scanAccount,
    });

    return {
      scan,
      scanFetchStatus: scan ? FetchStatus.Fetched : FetchStatus.Error,
    };
  } catch {
    return { scan: null, scanFetchStatus: FetchStatus.Error };
  }
}

/**
 * Schedules the background refreshes for the open dialog.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @param refreshes - Which refreshes to schedule.
 * @param refreshes.pricesEnabled - Whether to refresh token prices.
 * @param refreshes.validityRefreshEnabled - Whether to refresh transaction validity and scans.
 */
async function scheduleRefreshes(
  snapClient: SnapClient,
  {
    pricesEnabled,
    validityRefreshEnabled,
  }: { pricesEnabled: boolean; validityRefreshEnabled: boolean },
): Promise<void> {
  if (pricesEnabled) {
    // Trigger immediate price fetch (1 second), then continue every 20 seconds
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationPrices,
      duration: 'PT1S', // Start immediately
    });
  }

  // Refresh transaction validity and any enabled scans every 20 seconds.
  if (validityRefreshEnabled) {
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationSend,
      duration: 'PT20S',
    });
  }
}
