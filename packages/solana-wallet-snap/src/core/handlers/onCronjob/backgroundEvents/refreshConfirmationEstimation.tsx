import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';
import type { SecurityAlertsScanOption } from '@metamask/snap-networks-utils';
import type { OnCronjobHandler } from '@metamask/snaps-sdk';

import { ConfirmTransactionRequest } from '../../../../features/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from '../../../../features/confirmation/views/ConfirmTransactionRequest/types';
import { toUiContext } from '../../../../features/confirmation/views/ConfirmTransactionRequest/utils';
import {
  connection,
  state,
  transactionScanService,
} from '../../../../snapContext';
import { isTransactionBlockhashExpired } from '../../../services/confirmation/isTransactionBlockhashExpired';
import type { UnencryptedStateValue } from '../../../services/state/stateTypes';
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
 * Returns the scan to store after a refresh. A refresh without a validation
 * verdict keeps the latest verdict, so a known malicious verdict is not lost.
 * The refresh's validation error is dropped in that case, so the known verdict
 * is shown instead of an unavailable notice.
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
    return {
      ...refreshedScan,
      validation: knownValidation,
      validationError: null,
    };
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

    // Re-scan with the same options the initial scan used, per preference:
    // simulation only when simulation is enabled, validation only when
    // security alerts are enabled.
    const options: SecurityAlertsScanOption[] = [];
    if (interfaceContext.preferences?.simulateOnChainActions) {
      options.push('simulation');
    }
    if (interfaceContext.preferences?.useSecurityAlerts) {
      options.push('validation');
    }
    const shouldScan = options.length > 0;

    // MetaMask-originated transactions receive a fresh blockhash before signing.
    const shouldSkipBlockhashCheck =
      interfaceContext.origin === DEFAULT_METAMASK_ORIGIN;

    // Background re-scans never surface the scan-in-progress state: per the
    // transaction warning contract, they must never disable confirm. The
    // interface is only updated once the re-scan settles.
    if (!shouldScan) {
      logger.info(`Transaction simulation is disabled in preferences`);
    }

    // The scan and expiry check run outside the interface lock because they
    // can take a while. Only the read-merge-write below runs under the lock.
    const [scan, isExpired] = await Promise.all([
      shouldScan
        ? transactionScanService.scanTransaction({
            method: interfaceContext.method,
            accountAddress: interfaceContext.account.address,
            transaction: interfaceContext.transaction,
            scope: interfaceContext.scope,
            origin: interfaceContext.origin,
            account: interfaceContext.account,
            options,
          })
        : Promise.resolve(null),
      shouldSkipBlockhashCheck
        ? Promise.resolve(false)
        : isTransactionBlockhashExpired(
            interfaceContext.transaction,
            connection.getRpc(interfaceContext.scope),
          ),
    ]);

    // Read and write the latest context under the lock. A handler, such as the
    // user opening acknowledgement, may update the interface while the scan is
    // running. Writing a context captured before the scan would overwrite it.
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

        // Retain estimates after an outage, but do not reuse a stale execution
        // failure as a blocker. Local expiry remains independent and cannot be
        // cleared by a later failed scan or inconclusive blockhash check.
        const scanFailed = shouldScan && scan === null;

        const updatedInterfaceContext = {
          ...latestInterfaceContext,
          scanFetchStatus: scanFailed
            ? ('error' as const)
            : ('fetched' as const),
          scan: scan
            ? keepKnownVerdict(latestInterfaceContext.scan, scan)
            : (latestInterfaceContext.scan ?? null),
          transactionExpired:
            isExpired || latestInterfaceContext.transactionExpired === true,
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
    // overwritten. Check if context exists in case the UI was closed, in which
    // case there is nothing to roll back.
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

        const fetchingConfirmationContext = {
          ...fetchedInterfaceContext,
          scanFetchStatus: 'fetched',
        } as ConfirmTransactionRequestContext;

        await updateInterface(
          confirmationInterfaceId,
          <ConfirmTransactionRequest
            context={toUiContext(fetchingConfirmationContext)}
          />,
          fetchingConfirmationContext,
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
