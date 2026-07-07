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
import type { TronKeyringAccount } from '../../../../entities/keyring-account';
import { BackgroundEventMethod } from '../../../../handlers/cronjob';
import { EXPIRED_TRANSACTION_SCAN } from '../../../../services/transaction-scan/buildExpiredScanResult';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { FetchStatus } from '../../../../types/snap';
import logger from '../../../../utils/logger';
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
  scanFetchStatus: FetchStatus.Initial,
  tokenPrices: {},
  tokenPricesFetchStatus: FetchStatus.Initial,
  fees: [],
  feesFetchStatus: FetchStatus.Initial,
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
    scanFetchStatus: FetchStatus.Loading, // Start as Loading (first fetch) not Fetching
    tokenPricesFetchStatus: FetchStatus.Initial,
    feesFetchStatus: FetchStatus.Initial,
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
    context.feesFetchStatus = FetchStatus.Fetched;
    context.tokenPrices = tokenPrices;
    context.tokenPricesFetchStatus = FetchStatus.Fetched;
  } catch {
    context.fees = [];
    context.feesFetchStatus = FetchStatus.Error;
    context.tokenPrices = {};
    context.tokenPricesFetchStatus = FetchStatus.Error;
  }

  // Create initial interface with loading state
  const id = await snapClient.createInterface(
    <ConfirmSignTransaction context={context} />,
    context,
  );

  const dialogPromise = snapClient.showDialog(id);

  // Store the interface ID so the cron refresh can find this dialog.
  const storeIdPromise = snapContext.state.setKey(
    `mapInterfaceNameToId.${CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME}`,
    id,
  );

  const securityScanEnabled =
    Boolean(transactionScanService) &&
    (useSecurityAlerts || simulateOnChainActions);

  try {
    let scan: TransactionScanResult | null = null;

    if (securityScanEnabled) {
      const options: string[] = [];

      if (simulateOnChainActions) {
        options.push('simulation');
      }

      if (useSecurityAlerts) {
        options.push('validation');
      }

      try {
        scan = await transactionScanService.scanTransaction({
          accountAddress: account.address,
          transactionRawData: rawData,
          origin,
          scope: scope as Network,
          options,
        });
      } catch {
        scan = null;
      }
    }

    // Local TAPOS-expiry check. The security-API simulation does not validate
    // Tron TAPOS fields (expiration / ref block), so the snap surfaces protocol
    // expiry itself. This is independent of the security preferences: an expired
    // transaction won't broadcast regardless of the contract simulation result,
    // so it takes precedence over a benign scan.
    try {
      const expired =
        await snapContext.transactionExpirationRefresherService.isTransactionExpired(
          {
            scope: scope as Network,
            rawData,
          },
        );

      if (expired) {
        scan = EXPIRED_TRANSACTION_SCAN;
      }
    } catch (error) {
      logger.error('Error checking transaction expiration:', error);
      await snapClient.trackError(error as Error);
    }

    context.scan = scan;
    if (scan) {
      context.scanFetchStatus = FetchStatus.Fetched;
    } else if (securityScanEnabled) {
      context.scanFetchStatus = FetchStatus.Error;
    } else {
      context.scanFetchStatus = FetchStatus.Fetched;
    }

    await storeIdPromise;

    await snapClient.updateInterface(
      id,
      <ConfirmSignTransaction context={context} />,
      context,
    );
  } catch {
    context.scan = null;
    context.scanFetchStatus = FetchStatus.Error;

    await storeIdPromise;

    await snapClient.updateInterface(
      id,
      <ConfirmSignTransaction context={context} />,
      context,
    );
  }

  // Re-scan periodically so the expiry banner appears live as the transaction
  // ages past its TAPOS validity window, regardless of security preferences.
  // Scheduling is best-effort and isolated from the scan result: a failure here
  // must not wipe out a valid scan or flip the UI into a scan error state — the
  // user can still act on the current result, only live refreshes are skipped.
  try {
    await snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.RefreshSignTransaction,
      duration: 'PT20S',
    });
  } catch (error) {
    logger.error('Error scheduling background refresh event:', error);
    await snapClient.trackError(error as Error);
    // Best-effort: live expiry refreshes won't run, but the rendered result
    // stays intact.
  }

  return dialogPromise;
}
