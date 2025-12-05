import type { KeyringRequest } from '@metamask/keyring-api';
import type { DialogResult } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import { TronWeb } from 'tronweb';
import type { Transaction } from 'tronweb/lib/esm/types';

import { ConfirmSignTransaction } from './ConfirmSignTransaction';
import { CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME } from './types';
import type { ConfirmSignTransactionContext } from './types';
import { Network } from '../../../../constants';
import snapContext from '../../../../context';
import type { TronKeyringAccount } from '../../../../entities';
import { BackgroundEventMethod } from '../../../../handlers/cronjob';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { SignTransactionRequestStruct } from '../../../../validation/structs';

export const DEFAULT_CONTEXT: ConfirmSignTransactionContext = {
  scope: Network.Mainnet,
  account: null,
  transaction: {
    rawDataHex: '',
    type: '',
  },
  origin: '',
  networkImage: TRX_IMAGE_SVG,
  scan: null,
  scanFetchStatus: 'initial',
  tokenPrices: {},
  tokenPricesFetchStatus: 'initial',
  scanParameters: null,
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
 * Renders the confirmation dialog for a sign transaction request.
 *
 * @param request - The keyring request to confirm.
 * @param account - The account that the request is for.
 * @param rawData - The raw data of the transaction.
 * @returns The confirmation dialog result.
 */
export async function render(
  request: KeyringRequest,
  account: TronKeyringAccount,
  rawData: Transaction['raw_data'],
): Promise<DialogResult> {
  const { snapClient, transactionScanService } = snapContext;
  assert(request.request.params, SignTransactionRequestStruct);

  const {
    request: {
      params: { transaction },
    },
    scope,
    origin,
  } = request;

  // Build initial context
  const context: ConfirmSignTransactionContext = {
    ...DEFAULT_CONTEXT,
    scope: scope as Network,
    account,
    transaction,
    origin: origin ?? 'Unknown',
    scanFetchStatus: 'fetching',
    tokenPricesFetchStatus: 'fetching',
  };

  // Get preferences
  try {
    context.preferences = await snapClient.getPreferences();
  } catch {
    context.preferences = DEFAULT_CONTEXT.preferences;
  }

  const { useSecurityAlerts, simulateOnChainActions } = context.preferences;

  // Create initial interface with loading state
  const id = await snapClient.createInterface(
    <ConfirmSignTransaction context={context} />,
    context,
  );

  const dialogPromise = snapClient.showDialog(id);

  // Store interface ID in state for background refresh
  await snapContext.state.setKey(
    `mapInterfaceNameToId.${CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME}`,
    id,
  );

  // Schedule background job for price fetching if enabled
  if (context.preferences.useExternalPricingData) {
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshConfirmationPrices,
      duration: 'PT1S', // Start immediately
    });
  } else {
    // If pricing is disabled, set to fetched immediately
    context.tokenPricesFetchStatus = 'fetched';
  }

  // If security scanning is enabled, scan the transaction
  if (transactionScanService && (useSecurityAlerts || simulateOnChainActions)) {
    const options: string[] = [];

    if (simulateOnChainActions) {
      options.push('simulation');
    }

    if (useSecurityAlerts) {
      options.push('validation');
    }

    try {
      // Extract hex addresses from raw data
      const contractParam = rawData.contract?.[0]?.parameter?.value as any;
      const fromHex = contractParam?.owner_address ?? '';
      const toHex =
        contractParam?.contract_address ?? contractParam?.to_address ?? '';
      const value = contractParam?.call_value ?? 0;

      // Convert hex addresses to base58 format
      const from = fromHex ? TronWeb.address.fromHex(fromHex) : '';
      const to = toHex ? TronWeb.address.fromHex(toHex) : '';

      context.scanParameters = {
        from,
        to,
        data: `0x${transaction.rawDataHex}`,
        value,
      };

      const scan = await transactionScanService.scanTransaction({
        accountAddress: account.address,
        from,
        to,
        data: `0x${transaction.rawDataHex}`,
        value,
        origin,
        options,
      });

      context.scan = scan;
      context.scanFetchStatus = scan ? 'fetched' : 'error';
    } catch {
      context.scan = null;
      context.scanFetchStatus = 'error';
    }

    // Update interface with scan results
    await snapClient.updateInterface(
      id,
      <ConfirmSignTransaction context={context} />,
      context,
    );

    // Schedule background refresh for scan and prices (20 seconds like Solana)
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshSignTransaction,
      duration: 'PT20S',
    });
  } else {
    // No scanning, mark as fetched immediately
    context.scanFetchStatus = 'fetched';
    await snapClient.updateInterface(
      id,
      <ConfirmSignTransaction context={context} />,
      context,
    );
  }

  return dialogPromise;
}
