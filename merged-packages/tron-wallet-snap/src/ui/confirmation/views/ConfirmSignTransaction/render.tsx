import type { KeyringRequest } from '@metamask/keyring-api';
import type { DialogResult } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';
import { bytesToHex, hexToBytes, sha256 } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import type { Transaction } from 'tronweb/lib/esm/types';

import { ConfirmSignTransaction } from './ConfirmSignTransaction';
import { CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME } from './types';
import type { ConfirmSignTransactionContext } from './types';
import { Network, Networks, ZERO } from '../../../../constants';
import snapContext from '../../../../context';
import type { TronKeyringAccount } from '../../../../entities';
import { BackgroundEventMethod } from '../../../../handlers/cronjob';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { SignTransactionRequestStruct } from '../../../../validation/structs';
import { getIconUrlForKnownAsset } from '../../utils/getIconUrlForKnownAsset';

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
  fees: [],
  feesFetchStatus: 'initial',
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
    tokenPricesFetchStatus: 'initial',
    feesFetchStatus: 'initial',
  };

  const { assetsService, feeCalculatorService, priceApiClient } = snapContext;

  // Parallelize: Get preferences + Fetch account assets
  const [preferences, accountAssets] = await Promise.all([
    snapClient.getPreferences().catch(() => DEFAULT_CONTEXT.preferences),
    assetsService.getAssetsByAccountId(account.id, [
      Networks[scope as Network].bandwidth.id,
      Networks[scope as Network].energy.id,
    ]),
  ]);

  context.preferences = preferences;

  const { useSecurityAlerts, simulateOnChainActions, useExternalPricingData } =
    context.preferences;

  // Calculate fees
  try {
    const [bandwidthAsset, energyAsset] = accountAssets;

    const availableEnergy = energyAsset
      ? new BigNumber(energyAsset.rawAmount)
      : ZERO;
    const availableBandwidth = bandwidthAsset
      ? new BigNumber(bandwidthAsset.rawAmount)
      : ZERO;

    // Build transaction object from raw data
    const txID = bytesToHex(
      await sha256(hexToBytes(transaction.rawDataHex)),
    ).slice(2);

    const transactionObj: Transaction = {
      visible: true,
      txID,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data: rawData,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      raw_data_hex: transaction.rawDataHex,
    };

    const fees = await feeCalculatorService.computeFee({
      scope: scope as Network,
      transaction: transactionObj,
      availableEnergy,
      availableBandwidth,
    });

    // Resolve icon URLs for fee assets
    fees.forEach((fee) => {
      fee.asset.iconUrl = getIconUrlForKnownAsset(fee.asset.type);
    });

    // Fetch prices if enabled
    const tokenPrices = useExternalPricingData
      ? await priceApiClient
          .getMultipleSpotPrices(
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [`${scope}/slip44:195`] as any,
            context.preferences.currency,
          )
          .catch(() => ({}))
      : {};

    context.fees = fees;
    context.feesFetchStatus = 'fetched';
    context.tokenPrices = tokenPrices;
    context.tokenPricesFetchStatus = 'fetched';
  } catch {
    context.fees = [];
    context.feesFetchStatus = 'error';
    context.tokenPrices = {};
    context.tokenPricesFetchStatus = 'error';
  }

  // Create initial interface with loading state
  const id = await snapClient.createInterface(
    <ConfirmSignTransaction context={context} />,
    context,
  );

  const dialogPromise = snapClient.showDialog(id);

  // Parallelize: Store interface ID + Start security scan
  const storeIdPromise = snapContext.state.setKey(
    `mapInterfaceNameToId.${CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME}`,
    id,
  );

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
      const scan = await transactionScanService.scanTransaction({
        accountAddress: account.address,
        transactionRawData: rawData,
        origin,
        scope: scope as Network,
        options,
      });

      context.scan = scan;
      context.scanFetchStatus = scan ? 'fetched' : 'error';
    } catch {
      context.scan = null;
      context.scanFetchStatus = 'error';
    }

    // Ensure interface ID is stored before updating
    await storeIdPromise;

    // Update interface with scan results (silently ignores if interface was dismissed)
    const updated = await snapClient.updateInterfaceIfExists(
      id,
      <ConfirmSignTransaction context={context} />,
      context,
    );

    // If interface was dismissed during scan, exit early
    if (!updated) {
      return dialogPromise;
    }

    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshSignTransaction,
      duration: 'PT20S',
    });
  } else {
    // No scanning, mark as fetched immediately
    context.scanFetchStatus = 'fetched';

    // Ensure interface ID is stored before updating
    await storeIdPromise;

    // Update interface (silently ignores if interface was dismissed)
    await snapClient.updateInterfaceIfExists(
      id,
      <ConfirmSignTransaction context={context} />,
      context,
    );
  }

  return dialogPromise;
}
