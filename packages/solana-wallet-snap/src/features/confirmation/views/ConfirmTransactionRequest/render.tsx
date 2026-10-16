import { SolMethod } from '@metamask/keyring-api';

import { Network, Networks } from '../../../../core/constants/solana';
import { FeeCalculator } from '../../../../core/fees';
import { SOL_IMAGE_SVG } from '../../../../core/test/mocks/solana-image-svg';
import { lamportsToSol } from '../../../../core/utils/conversion';
import { trackError } from '../../../../core/utils/errors';
import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  createInterface,
  getPreferences,
  showDialog,
  updateInterface,
} from '../../../../core/utils/interface';
import logger from '../../../../core/utils/logger';
import { extractInstructionsFromUnknownBase64String } from '../../../../entities';
import {
  accountsService,
  assetsService,
  connection,
  nameResolutionService,
  priceApiClient,
  state,
  transactionScanService,
} from '../../../../snapContext';
import { analyzeFeePayment } from '../../utils/analyzeFeePayment';
import type { FeePayment } from '../../utils/analyzeFeePayment';
import { createFeePaymentChainReader } from '../../utils/createFeePaymentChainReader';
import { extractDestinationAddress } from '../../utils/extractDestinationAddress';
import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from './types';

export const DEFAULT_CONFIRMATION_CONTEXT: ConfirmTransactionRequestContext = {
  method: SolMethod.SignAndSendTransaction,
  scope: Network.Mainnet,
  networkImage: SOL_IMAGE_SVG,
  account: null,
  accountDomain: null,
  destinationAddress: null,
  destinationDomain: null,
  transaction: '',
  scan: null,
  scanFetchStatus: 'fetching',
  feeEstimatedInSol: '0',
  feePayment: null,
  tokenPrices: {},
  tokenPricesFetchStatus: 'fetching',
  origin: '',
  preferences: {
    locale: 'en',
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: true,
    useExternalPricingData: true,
    simulateOnChainActions: true,
    useTokenDetection: true,
    batchCheckBalances: true,
    displayNftMedia: true,
    useNftDetection: true,
  },
  advanced: {
    shown: false,
    instructions: [],
  },
};

/**
 * Works out who pays the network fee and what the user pays when it is
 * sponsored. Never throws: on failure the confirmation shows the fee as usual.
 *
 * @param context - The confirmation context.
 * @param instructionsExtracted - Whether the transaction instructions could be parsed.
 * @returns The fee payment, or `null` if it could not be determined.
 */
async function getFeePayment(
  context: ConfirmTransactionRequestContext,
  instructionsExtracted: boolean,
): Promise<FeePayment | null> {
  if (!context.account) {
    return null;
  }

  try {
    const ownAccounts = await accountsService.getAll();
    const feePayment = await analyzeFeePayment({
      transaction: context.transaction,
      accountAddress: context.account.address,
      ownAddresses: ownAccounts.map((account) => account.address),
      instructions: context.advanced.instructions,
      reader: createFeePaymentChainReader(
        connection.getRpc(context.scope),
        context.scope,
        async (assetTypes) => assetsService.getAssetsMetadata(assetTypes),
      ),
    });

    if (instructionsExtracted || feePayment.paidBy !== 'sponsor') {
      return feePayment;
    }

    // Without the instructions we cannot tell what the user pays.
    return {
      ...feePayment,
      userCost: feePayment.userCost === 'costs' ? 'costs' : 'unverified',
      mayCostMore: true,
    };
  } catch (error) {
    await trackError(error);
    return null;
  }
}

/**
 * Renders the confirmation dialog for a transaction request.
 *
 * @param incomingContext - The confirmation context.
 * @returns The confirmation dialog.
 */
export async function render(
  incomingContext: ConfirmTransactionRequestContext,
) {
  /**
   * First render:
   * - Get preferences
   */
  const context = {
    ...DEFAULT_CONFIRMATION_CONTEXT,
    ...incomingContext,
  };

  const preferencesPromise = getPreferences()
    .then((preferences) => {
      context.preferences = preferences;
    })
    .catch(() => {
      context.preferences = DEFAULT_CONFIRMATION_CONTEXT.preferences;
    });

  let instructionsExtracted = false;
  const instructionsPromise = extractInstructionsFromUnknownBase64String(
    connection.getRpc(context.scope),
    context.transaction,
  )
    .then(async (instructions) => {
      context.advanced.instructions = instructions;
      instructionsExtracted = true;

      try {
        context.destinationAddress = extractDestinationAddress(instructions);
      } catch (error) {
        await trackError(error);
        context.destinationAddress = null;
      }
    })
    .catch(async (error) => {
      await trackError(error);
      logger.error(error);
      context.advanced.instructions = [];
    });

  const accountDomainPromise = context.account?.address
    ? nameResolutionService
        .resolveAddress(context.scope, context.account.address)
        .then((domain) => {
          context.accountDomain = domain;
        })
    : Promise.resolve().then(() => {
        context.accountDomain = null;
      });

  await Promise.all([
    preferencesPromise,
    instructionsPromise,
    accountDomainPromise,
  ]);

  const {
    currency,
    useExternalPricingData,
    useSecurityAlerts,
    simulateOnChainActions,
  } = context.preferences;

  const id = await createInterface(
    <ConfirmTransactionRequest context={context} />,
    context,
  );

  const dialogPromise = showDialog(id);

  /**
   * Second render:
   * - Resolve destination domain
   * - Get token prices
   * - Get transaction fee
   */
  const updatedContext1 = {
    ...context,
  };

  const destinationDomainPromise = context.destinationAddress
    ? nameResolutionService
        .resolveAddress(context.scope, context.destinationAddress)
        .then((domain) => {
          updatedContext1.destinationDomain = domain;
        })
        .catch(async (error) => {
          await trackError(error);
          updatedContext1.destinationDomain = null;
        })
    : Promise.resolve();

  const assets = [Networks[context.scope].nativeToken.caip19Id];

  const tokenPricesPromise = useExternalPricingData
    ? priceApiClient
        .getMultipleSpotPrices(assets, currency)
        .then((prices) => {
          updatedContext1.tokenPrices = prices;
          updatedContext1.tokenPricesFetchStatus = 'fetched';
        })
        .catch(async (error) => {
          await trackError(error);
          updatedContext1.tokenPricesFetchStatus = 'error';
        })
    : Promise.resolve().then(() => {
        updatedContext1.tokenPricesFetchStatus = 'fetched';
        updatedContext1.tokenPrices = {};
      });

  const [, , feePayment] = await Promise.all([
    destinationDomainPromise,
    tokenPricesPromise,
    getFeePayment(context, instructionsExtracted),
  ]);
  updatedContext1.feePayment = feePayment;

  let feeEstimatedInSol: string | null = null;
  try {
    const { totalFee } = FeeCalculator.calculateFee(context.transaction);
    feeEstimatedInSol = lamportsToSol(totalFee).toString();
  } catch (error) {
    await trackError(error);
    feeEstimatedInSol = null;
  }
  updatedContext1.feeEstimatedInSol = feeEstimatedInSol;

  await updateInterface(
    id,
    <ConfirmTransactionRequest context={updatedContext1} />,
    updatedContext1,
  );

  /**
   * Third render:
   * - Scan transaction
   */
  const updatedContext2 = {
    ...updatedContext1,
  };

  const options = [];

  if (simulateOnChainActions) {
    options.push('simulation');
  }

  if (useSecurityAlerts) {
    options.push('validation');
  }

  if (simulateOnChainActions || useSecurityAlerts) {
    const transactionScanPromise = transactionScanService
      .scanTransaction({
        method: updatedContext2.method,
        accountAddress: updatedContext2.account?.address ?? '',
        transaction: updatedContext2.transaction,
        scope: updatedContext2.scope,
        origin: updatedContext2.origin,
        options,
      })
      .then(async (scan) => {
        updatedContext2.scan = scan;
        updatedContext2.scanFetchStatus = scan ? 'fetched' : 'error';
      })
      .catch(async (error) => {
        await trackError(error);
        updatedContext2.scan = null;
        updatedContext2.scanFetchStatus = 'error';
      });

    await Promise.all([transactionScanPromise]);
  } else {
    updatedContext2.scanFetchStatus = 'fetched';
    updatedContext2.scan = null;
  }

  await updateInterface(
    id,
    <ConfirmTransactionRequest context={updatedContext2} />,
    updatedContext2,
  );

  await state.setKey(
    `mapInterfaceNameToId.${CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME}`,
    id,
  );

  // Schedule the next refresh
  await snap.request({
    method: 'snap_scheduleBackgroundEvent',
    params: {
      duration: 'PT20S',
      request: { method: 'refreshConfirmationEstimation' },
    },
  });

  return dialogPromise;
}
