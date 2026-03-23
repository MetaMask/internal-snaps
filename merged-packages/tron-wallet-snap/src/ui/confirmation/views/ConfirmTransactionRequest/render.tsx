import type { DialogResult, Json } from '@metamask/snaps-sdk';
import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { Types } from 'tronweb';

import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import {
  CONFIRM_TRANSACTION_INTERFACE_NAME,
  type ConfirmTransactionRequestContext,
} from './types';
import { buildTransactionRawData } from '../../../../clients/security-alerts-api/utils';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import snapContext from '../../../../context';
import type { TronKeyringAccount } from '../../../../entities';
import type { AssetEntity } from '../../../../entities/assets';
import { BackgroundEventMethod } from '../../../../handlers/cronjob';
import type { ComputeFeeResult } from '../../../../services/send/types';
import type {
  State,
  UnencryptedStateValue,
} from '../../../../services/state/State';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { FetchStatus } from '../../../../types/snap';
import { getIconUrlForKnownAsset } from '../../utils/getIconUrlForKnownAsset';

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
  origin: 'MetaMask',
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
 * Builds a minimal raw transaction data object from the send details,
 * suitable for security scanning via the Security Alerts API.
 *
 * @param fromAddress - The sender address (base58).
 * @param toAddress - The recipient address (base58).
 * @param amount - The amount to send (display units).
 * @param asset - The asset being sent.
 * @returns A minimal raw transaction data object.
 */
function buildScanTransactionRawData(
  fromAddress: string,
  toAddress: string,
  amount: string,
  asset: AssetEntity,
): ReturnType<typeof buildTransactionRawData> {
  const { assetNamespace, assetReference } = parseCaipAssetType(
    asset.assetType,
  );
  const isTrc20 = assetNamespace === 'trc20';

  if (isTrc20) {
    return buildTransactionRawData({
      from: fromAddress,
      to: assetReference,
      amount: 0,
      contractType: Types.ContractType.TriggerSmartContract,
    });
  }

  const rawValue = new BigNumber(amount)
    .multipliedBy(new BigNumber(10).pow(asset.decimals))
    .toNumber();

  return buildTransactionRawData({
    from: fromAddress,
    to: toAddress,
    amount: rawValue,
    contractType: Types.ContractType.TransferContract,
  });
}

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
 * @returns A dialog result with the user's decision.
 */
export async function render(
  snapClient: SnapClient,
  state: State<UnencryptedStateValue>,
  incomingContext: {
    scope: Network;
    fromAddress: string;
    toAddress: string;
    amount: string;
    fees: ComputeFeeResult;
    asset: AssetEntity;
    origin: string;
    accountType: string;
  },
): Promise<DialogResult> {
  const { transactionScanService } = snapContext;

  // 1. Initial context with loading state
  const context: ConfirmTransactionRequestContext = {
    ...DEFAULT_CONFIRMATION_CONTEXT,
    ...incomingContext,
    tokenPricesFetchStatus: FetchStatus.Fetching, // Start as fetching
    scanFetchStatus: FetchStatus.Fetching, // Start as fetching
  };

  try {
    context.preferences = await snapClient.getPreferences();
  } catch {
    // keep defaults
  }

  const { useSecurityAlerts } = context.preferences;

  /**
   * Resolve icon URLs for fee assets from known asset metadata.
   */
  context.fees.forEach((fee) => {
    fee.asset.iconUrl = getIconUrlForKnownAsset(fee.asset.type);
  });

  // Build a minimal raw transaction for security scanning
  const transactionRawData = buildScanTransactionRawData(
    incomingContext.fromAddress,
    incomingContext.toAddress,
    incomingContext.amount,
    incomingContext.asset,
  );
  context.transactionRawData = transactionRawData as unknown as Json;

  // 2. Initial render with loading skeleton (always show loading if pricing enabled)
  const id = await snapClient.createInterface(
    <ConfirmTransactionRequest context={context} />,
    context,
  );
  const dialogPromise = snapClient.showDialog(id);

  // Store interface ID by name for background refresh (Solana pattern)
  const storeIdPromise = state.setKey(
    `mapInterfaceNameToId.${CONFIRM_TRANSACTION_INTERFACE_NAME}`,
    id,
  );

  // 3. Perform security scan (always needed for estimated changes simulation)
  if (transactionScanService) {
    // Always request simulation for estimated changes;
    // conditionally add validation based on user preference
    const options: string[] = ['simulation'];

    if (useSecurityAlerts) {
      options.push('validation');
    }

    // Create a minimal account object for analytics tracking
    const scanAccount = {
      type: incomingContext.accountType,
      address: incomingContext.fromAddress,
    } as TronKeyringAccount;

    try {
      const scan = await transactionScanService.scanTransaction({
        accountAddress: incomingContext.fromAddress,
        transactionRawData,
        origin: incomingContext.origin,
        scope: incomingContext.scope,
        options,
        account: scanAccount,
      });

      context.scan = scan;
      context.scanFetchStatus = scan ? FetchStatus.Fetched : FetchStatus.Error;
    } catch {
      context.scan = null;
      context.scanFetchStatus = FetchStatus.Error;
    }
  } else {
    // No scan service available, mark as fetched immediately
    context.scanFetchStatus = FetchStatus.Fetched;
  }

  // Ensure interface ID is stored before updating
  await storeIdPromise;

  // 4. If pricing is disabled, mark as fetched immediately
  if (!context.preferences.useExternalPricingData) {
    context.tokenPricesFetchStatus = FetchStatus.Fetched;
  }

  // 5. Update interface with scan results after initial render (silently ignores if dismissed)
  const updated = await snapClient.updateInterfaceIfExists(
    id,
    <ConfirmTransactionRequest context={context} />,
    context,
  );

  // If interface was dismissed during scan, exit early
  if (!updated) {
    return dialogPromise;
  }

  // 6. Schedule background jobs only after confirming the interface is still alive
  if (context.preferences.useExternalPricingData) {
    // Trigger immediate price fetch (1 second), then continue every 20 seconds
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationPrices,
      duration: 'PT1S', // Start immediately
    });
  }

  // Schedule security scan background refresh (every 20 seconds)
  if (transactionScanService) {
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationSend,
      duration: 'PT20S',
    });
  }

  // 7. Return the dialog promise immediately (don't await it!)
  // Cleanup happens in the background refresh handler when it detects the interface is gone
  return dialogPromise;
}
