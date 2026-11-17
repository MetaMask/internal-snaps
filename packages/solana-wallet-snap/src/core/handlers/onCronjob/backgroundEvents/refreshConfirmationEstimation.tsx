import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';
import type { OnCronjobHandler } from '@metamask/snaps-sdk';

import { ConfirmTransactionRequest } from '../../../../features/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from '../../../../features/confirmation/views/ConfirmTransactionRequest/types';
import { toUiContext } from '../../../../features/confirmation/views/ConfirmTransactionRequest/utils';
import {
  connection,
  state,
  transactionScanService,
} from '../../../../snapContext';
import type { UnencryptedStateValue } from '../../../services/state/stateTypes';
import { EXPIRED_TRANSACTION_SCAN } from '../../../services/transaction-scan/buildExpiredScanResult';
import { isTransactionBlockhashExpired } from '../../../services/transaction-scan/isTransactionBlockhashExpired';
import type { TransactionScanResult } from '../../../services/transaction-scan/types';
import { trackError } from '../../../utils/errors';
import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  getInterfaceContext,
  updateInterface,
  withInterfaceLock,
} from '../../../utils/interface';
import baseLogger from '../../../utils/logger';
import { ScheduleBackgroundEventMethod } from './ScheduleBackgroundEventMethod';

/**
 * Returns the scan to store after a refresh. The simulation data always comes
 * from the refresh, but a refresh without a validation verdict keeps the latest
 * verdict, so a known malicious verdict is not lost.
 *
 * @param latestScan - The scan stored before this refresh.
 * @param refreshedScan - The scan produced by this refresh.
 * @returns The scan to store.
 */
function keepKnownVerdict(
  latestScan: TransactionScanResult | null,
  refreshedScan: TransactionScanResult,
): TransactionScanResult {
  const knownValidation = latestScan?.validation;

  if (!refreshedScan.validation?.type && knownValidation?.type) {
    return { ...refreshedScan, validation: knownValidation };
  }

  return refreshedScan;
}

export const refreshConfirmationEstimation: OnCronjobHandler = async () => {
  const logger = baseLogger.withPrefix('[refreshConfirmationEstimation]');

  logger.info(`Background event triggered`);

  const mapInterfaceNameToId =
    (await state.getKey<UnencryptedStateValue['mapInterfaceNameToId']>(
      'mapInterfaceNameToId',
    )) ?? {};

  const confirmationInterfaceId =
    mapInterfaceNameToId[CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME];

  // Don't do anything if the confirmation interface is not open
  if (!confirmationInterfaceId) {
    logger.info(`No interface context found`);
    return;
  }

  // Check if context exists in case the UI was closed before the background event ran
  const interfaceContext =
    await getInterfaceContext<ConfirmTransactionRequestContext>(
      confirmationInterfaceId,
    );

  if (!interfaceContext) {
    logger.info(`Interface context no longer exists, skipping refresh`);
    return;
  }

  // Update the interface context with the new rates.
  try {
    if (
      !interfaceContext.account?.address ||
      !interfaceContext.transaction ||
      !interfaceContext.scope ||
      !interfaceContext.method
    ) {
      logger.info(`Context is missing required fields`);
      return;
    }

    const shouldScan = Boolean(
      interfaceContext.preferences?.simulateOnChainActions,
    );

    // MetaMask-originated transactions receive a fresh blockhash before signing.
    const shouldSkipBlockhashCheck =
      interfaceContext.origin === DEFAULT_METAMASK_ORIGIN;

    // Background refreshes never set `fetching`. Only the initial load does, so
    // Confirm and an open acknowledgement stay usable while a refresh runs.
    if (!shouldScan) {
      logger.info(`Transaction simulation is disabled in preferences`);
    }

    // The scan and expiry check run outside the interface lock because they can
    // take a while. Only the read-merge-write below runs under the lock.
    const [scan, isExpired] = await Promise.all([
      shouldScan
        ? transactionScanService.scanTransaction({
            method: interfaceContext.method,
            accountAddress: interfaceContext.account.address,
            transaction: interfaceContext.transaction,
            scope: interfaceContext.scope,
            origin: interfaceContext.origin,
            account: interfaceContext.account,
          })
        : Promise.resolve(undefined),
      shouldSkipBlockhashCheck
        ? Promise.resolve(false)
        : isTransactionBlockhashExpired(
            interfaceContext.transaction,
            connection.getRpc(interfaceContext.scope),
          ),
    ]);

    // Merge the result into the latest context under the lock, so a handler's
    // update made while the scan was pending is kept.
    const isUpdated = await withInterfaceLock(
      confirmationInterfaceId,
      async () => {
        const latestInterfaceContext =
          await getInterfaceContext<ConfirmTransactionRequestContext>(
            confirmationInterfaceId,
          );

        // Check if context exists in case the UI was closed while scanning
        if (!latestInterfaceContext) {
          logger.info(
            `Interface context no longer exists after scan, skipping update`,
          );
          return false;
        }

        // Local expiry is sticky: once detected, neither a later check nor a
        // failed scan clears it.
        const transactionExpired =
          isExpired || latestInterfaceContext.transactionExpired === true;

        // Keep the latest scan unless this refresh produced one. A failed refresh
        // returns null, so it keeps the latest scan too. Local expiry takes
        // precedence, so its blocking state stays in place.
        let updatedScan = latestInterfaceContext.scan;
        if (scan) {
          updatedScan = keepKnownVerdict(latestInterfaceContext.scan, scan);
        }
        if (transactionExpired) {
          updatedScan = EXPIRED_TRANSACTION_SCAN;
        }

        const updatedInterfaceContext = {
          ...latestInterfaceContext,
          scanFetchStatus: 'fetched' as const,
          scan: updatedScan,
          transactionExpired,
        };

        if (shouldScan) {
          logger.info(`New scan fetched`);
        }

        await updateInterface(
          confirmationInterfaceId,
          <ConfirmTransactionRequest
            context={toUiContext(updatedInterfaceContext)}
          />,
          updatedInterfaceContext,
        );

        return true;
      },
    );

    if (!isUpdated) {
      return;
    }

    logger.info(`Background event suceeded`);

    // Schedule the next run
    await snap.request({
      method: 'snap_scheduleBackgroundEvent',
      params: {
        duration: 'PT20S',
        request: {
          method: ScheduleBackgroundEventMethod.RefreshConfirmationEstimation,
        },
      },
    });
  } catch (error) {
    await trackError(error);

    // Roll back under the lock so a handler's concurrent update is not
    // overwritten. Nothing is rolled back if the UI was closed.
    const isRolledBack = await withInterfaceLock(
      confirmationInterfaceId,
      async () => {
        const fetchedInterfaceContext =
          await getInterfaceContext<ConfirmTransactionRequestContext>(
            confirmationInterfaceId,
          );

        if (!fetchedInterfaceContext) {
          logger.info(`Interface context no longer exists, skipping rollback`);
          return false;
        }

        const rolledBackConfirmationContext = {
          ...fetchedInterfaceContext,
          scanFetchStatus: 'fetched',
        } as ConfirmTransactionRequestContext;

        await updateInterface(
          confirmationInterfaceId,
          <ConfirmTransactionRequest
            context={toUiContext(rolledBackConfirmationContext)}
          />,
          rolledBackConfirmationContext,
        );

        return true;
      },
    );

    if (isRolledBack) {
      logger.warn(
        { error },
        `Could not update the interface. But rolled back status to fetched.`,
      );
    }
  }
};
