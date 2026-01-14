import type { DialogResult } from '@metamask/snaps-sdk';

import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import {
  CONFIRM_TRANSACTION_INTERFACE_NAME,
  type ConfirmTransactionRequestContext,
} from './types';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
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
  preferences: {
    locale: 'en',
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: false,
    useExternalPricingData: true,
    simulateOnChainActions: false,
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
  },
): Promise<DialogResult> {
  // 1. Initial context with loading state
  const context: ConfirmTransactionRequestContext = {
    ...DEFAULT_CONFIRMATION_CONTEXT,
    ...incomingContext,
    tokenPricesFetchStatus: 'fetching', // Start as fetching
  };

  try {
    context.preferences = await snapClient.getPreferences();
  } catch {
    // keep defaults
  }

  /**
   * Resolve icon URLs for fee assets from known asset metadata.
   */
  context.fees.forEach((fee) => {
    fee.asset.iconUrl = getIconUrlForKnownAsset(fee.asset.type);
  });

  // 2. Initial render with loading skeleton (always show loading if pricing enabled)
  const id = await snapClient.createInterface(
    <ConfirmTransactionRequest context={context} />,
    context,
  );
  const dialogPromise = snapClient.showDialog(id);

  // Store interface ID by name for background refresh (Solana pattern)
  await state.setKey(
    `mapInterfaceNameToId.${CONFIRM_TRANSACTION_INTERFACE_NAME}`,
    id,
  );

  // 3. Schedule background job to handle all price fetching
  if (context.preferences.useExternalPricingData) {
    // Trigger immediate price fetch (1 second), then continue every 20 seconds
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationPrices,
      duration: 'PT1S', // Start immediately
    });
  } else {
    // If pricing is disabled, set to fetched immediately
    context.tokenPricesFetchStatus = 'fetched';
    await snapClient.updateInterface(
      id,
      <ConfirmTransactionRequest context={context} />,
      context,
    );
  }

  // 4. Return the dialog promise immediately (don't await it!)
  // Cleanup happens in the background refresh handler when it detects the interface is gone
  return dialogPromise;
}
