import {
  DEFAULT_METAMASK_ORIGIN,
  serialize,
} from '@metamask/snap-networks-utils';
import type { SecurityAlertsScanOption } from '@metamask/snap-networks-utils';
import type { OnCronjobHandler } from '@metamask/snaps-sdk';

import { ConfirmTransactionRequest } from '../../../../features/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from '../../../../features/confirmation/views/ConfirmTransactionRequest/types';
import {
  connection,
  state,
  transactionScanService,
} from '../../../../snapContext';
import type { UnencryptedStateValue } from '../../../services/state/stateTypes';
import { EXPIRED_TRANSACTION_SCAN } from '../../../services/transaction-scan/buildExpiredScanResult';
import { isTransactionBlockhashExpired } from '../../../services/transaction-scan/isTransactionBlockhashExpired';
import { trackError } from '../../../utils/errors';
import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  getInterfaceContext,
  updateInterface,
} from '../../../utils/interface';
import baseLogger from '../../../utils/logger';
import { ScheduleBackgroundEventMethod } from './ScheduleBackgroundEventMethod';

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

    const [scan, isExpired, updatedInterfaceContextFinal] = await Promise.all([
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
        : Promise.resolve(interfaceContext.scan),
      shouldSkipBlockhashCheck
        ? Promise.resolve(false)
        : isTransactionBlockhashExpired(
            interfaceContext.transaction,
            connection.getRpc(interfaceContext.scope),
          ),
      getInterfaceContext<ConfirmTransactionRequestContext>(
        confirmationInterfaceId,
      ),
    ]);

    // Check if context exists in case the UI was closed while scanning
    if (!updatedInterfaceContextFinal) {
      logger.info(
        `Interface context no longer exists after scan, skipping update`,
      );
      return;
    }

    // Update the current context with the new rates. A failed re-scan (null)
    // keeps the previous scan result for its estimates and reports the error
    // so the "scan failed" banner shows — the user is warned, not blocked.
    const scanFailed = shouldScan && scan === null && !isExpired;
    const nextScan = isExpired
      ? EXPIRED_TRANSACTION_SCAN
      : (scan ?? updatedInterfaceContextFinal.scan ?? null);

    const updatedInterfaceContext = {
      ...updatedInterfaceContextFinal,
      scanFetchStatus: scanFailed ? ('error' as const) : ('fetched' as const),
      scan: nextScan,
    };

    if (shouldScan) {
      logger.info(`New scan fetched`);
    }

    await updateInterface(
      confirmationInterfaceId,
      <ConfirmTransactionRequest
        context={serialize(updatedInterfaceContext) as any}
      />,
      updatedInterfaceContext,
    );

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

    // Check if context exists in case the UI was closed, nothing to rollback
    const fetchedInterfaceContext =
      await getInterfaceContext<ConfirmTransactionRequestContext>(
        confirmationInterfaceId,
      );

    if (!fetchedInterfaceContext) {
      logger.info(`Interface context no longer exists, skipping rollback`);
      return;
    }

    const fetchingConfirmationContext = {
      ...fetchedInterfaceContext,
      scanFetchStatus: 'fetched',
    } as ConfirmTransactionRequestContext;

    await updateInterface(
      confirmationInterfaceId,
      <ConfirmTransactionRequest
        context={serialize(fetchingConfirmationContext) as any}
      />,
      fetchingConfirmationContext,
    );

    logger.warn(
      { error },
      `Could not update the interface. But rolled back status to fetched.`,
    );
  }
};
