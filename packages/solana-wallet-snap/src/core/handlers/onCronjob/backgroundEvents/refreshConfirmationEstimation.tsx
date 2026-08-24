import type { OnCronjobHandler } from '@metamask/snaps-sdk';

import { ConfirmTransactionRequest } from '../../../../features/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from '../../../../features/confirmation/views/ConfirmTransactionRequest/types';
import {
  connection,
  state,
  transactionScanService,
} from '../../../../snapContext';
import { METAMASK_ORIGIN } from '../../../constants/solana';
import { serialize } from '../../../serialization/serialize';
import type { UnencryptedStateValue } from '../../../services/state/State';
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

    // Skip transaction simulation if the preference is disabled
    if (!interfaceContext.preferences?.simulateOnChainActions) {
      logger.info(`Transaction simulation is disabled in preferences`);
    }

    // MetaMask-originated transactions receive a fresh blockhash before signing.
    const shouldSkipBlockhashCheck =
      interfaceContext.origin === METAMASK_ORIGIN;

    const fetchingConfirmationContext = {
      ...interfaceContext,
      scanFetchStatus: 'fetching',
    } as ConfirmTransactionRequestContext;

    await updateInterface(
      confirmationInterfaceId,
      <ConfirmTransactionRequest
        context={serialize(fetchingConfirmationContext) as any}
      />,
      fetchingConfirmationContext,
    );

    const [scan, isExpired, updatedInterfaceContextFinal] = await Promise.all([
      interfaceContext.preferences?.simulateOnChainActions
        ? transactionScanService.scanTransaction({
            method: interfaceContext.method,
            accountAddress: interfaceContext.account.address,
            transaction: interfaceContext.transaction,
            scope: interfaceContext.scope,
            origin: interfaceContext.origin,
            account: interfaceContext.account,
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

    // Update the current context with the new rates
    const updatedInterfaceContext = {
      ...updatedInterfaceContextFinal,
      scanFetchStatus: 'fetched' as const,
      scan: isExpired ? EXPIRED_TRANSACTION_SCAN : scan,
    };

    if (interfaceContext.preferences?.simulateOnChainActions) {
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
