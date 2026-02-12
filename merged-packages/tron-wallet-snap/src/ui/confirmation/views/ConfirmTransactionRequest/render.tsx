import type { DialogResult } from '@metamask/snaps-sdk';
import { parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import {
  CONFIRM_TRANSACTION_INTERFACE_NAME,
  type ConfirmTransactionRequestContext,
} from './types';
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
  tokenPricesFetchStatus: 'initial',
  scan: null,
  scanFetchStatus: 'initial',
  scanParameters: null,
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
 * Build scan parameters from the transaction details.
 * For native TRX sends, uses the recipient address and amount in sun.
 * For TRC20 sends, uses the contract address as the target.
 *
 * @param fromAddress - The sender address.
 * @param toAddress - The recipient address.
 * @param amount - The amount to send (display units).
 * @param asset - The asset being sent.
 * @returns The scan parameters for the security alerts API.
 */
function buildScanParameters(
  fromAddress: string,
  toAddress: string,
  amount: string,
  asset: AssetEntity,
): {
  from: string | null;
  to: string | null;
  data: string | null;
  value: number | null;
} {
  const { assetNamespace, assetReference } = parseCaipAssetType(
    asset.assetType,
  );
  const isTrc20 = assetNamespace === 'trc20';

  if (isTrc20) {
    return {
      from: fromAddress,
      to: assetReference, // contract address
      data: null,
      value: null,
    };
  }

  // Native TRX: convert display amount to raw sun
  const rawValue = new BigNumber(amount)
    .multipliedBy(new BigNumber(10).pow(asset.decimals))
    .toNumber();

  return {
    from: fromAddress,
    to: toAddress,
    data: null,
    value: rawValue,
  };
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
    tokenPricesFetchStatus: 'fetching', // Start as fetching
    scanFetchStatus: 'fetching', // Start as fetching
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

  // Build scan parameters from transaction details
  context.scanParameters = buildScanParameters(
    incomingContext.fromAddress,
    incomingContext.toAddress,
    incomingContext.amount,
    incomingContext.asset,
  );

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
        parameters: {
          from: context.scanParameters?.from ?? undefined,
          to: context.scanParameters?.to ?? undefined,
          data: context.scanParameters?.data ?? undefined,
          value: context.scanParameters?.value ?? undefined,
        },
        origin: incomingContext.origin,
        scope: incomingContext.scope,
        options,
        account: scanAccount,
      });

      context.scan = scan;
      context.scanFetchStatus = scan ? 'fetched' : 'error';
    } catch {
      context.scan = null;
      context.scanFetchStatus = 'error';
    }
  } else {
    // No scan service available, mark as fetched immediately
    context.scanFetchStatus = 'fetched';
  }

  // Ensure interface ID is stored before updating
  await storeIdPromise;

  // 4. Schedule background job to handle price fetching and scan refresh
  if (context.preferences.useExternalPricingData) {
    // Trigger immediate price fetch (1 second), then continue every 20 seconds
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationPrices,
      duration: 'PT1S', // Start immediately
    });
  } else {
    // If pricing is disabled, set to fetched immediately
    context.tokenPricesFetchStatus = 'fetched';
  }

  // Schedule security scan background refresh (every 20 seconds)
  if (transactionScanService) {
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationSend,
      duration: 'PT20S',
    });
  }

  // 5. Update interface with scan results after initial render
  await snapClient.updateInterface(
    id,
    <ConfirmTransactionRequest context={context} />,
    context,
  );

  // 6. Return the dialog promise immediately (don't await it!)
  // Cleanup happens in the background refresh handler when it detects the interface is gone
  return dialogPromise;
}
