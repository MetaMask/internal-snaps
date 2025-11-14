import type { JsonRpcRequest } from '@metamask/utils';

import type { SnapClient } from '../clients/snap/SnapClient';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { State, UnencryptedStateValue } from '../services/state/State';
import { ConfirmTransactionRequest } from '../ui/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import {
  CONFIRM_TRANSACTION_INTERFACE_NAME,
  type ConfirmTransactionRequestContext,
} from '../ui/confirmation/views/ConfirmTransactionRequest/types';
import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';

export enum BackgroundEventMethod {
  ContinuouslySynchronizeSelectedAccounts = 'onContinuouslySynchronizeAccounts',
  SynchronizeSelectedAccounts = 'onSynchronizeSelectedAccounts',
  SynchronizeAccounts = 'onSynchronizeAccounts',
  SynchronizeAccount = 'onSynchronizeAccount',
  SynchronizeAccountTransactions = 'onSynchronizeAccountTransactions',
  RefreshConfirmationPrices = 'refreshConfirmationPrices',
}

export class CronHandler {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #snapClient: SnapClient;

  readonly #state: State<UnencryptedStateValue>;

  readonly #priceApiClient: any; // PriceApiClient type

  constructor({
    logger,
    accountsService,
    snapClient,
    state,
    priceApiClient,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    snapClient: SnapClient;
    state: State<UnencryptedStateValue>;
    priceApiClient: any;
  }) {
    this.#logger = createPrefixedLogger(logger, '[⏰ CronHandler]');
    this.#accountsService = accountsService;
    this.#snapClient = snapClient;
    this.#state = state;
    this.#priceApiClient = priceApiClient;
  }

  async handle(request: JsonRpcRequest): Promise<void> {
    const { method, params } = request;
    const { active } = await this.#snapClient.getClientStatus();

    if (!active) {
      return;
    }

    switch (method as BackgroundEventMethod) {
      case BackgroundEventMethod.ContinuouslySynchronizeSelectedAccounts:
        await this.continuouslySynchronizeSelectedAccounts();
        break;
      case BackgroundEventMethod.SynchronizeSelectedAccounts:
        await this.synchronizeSelectedAccounts();
        break;
      case BackgroundEventMethod.SynchronizeAccounts:
        await this.synchronizeAccounts(params as { accountIds: string[] });
        break;
      case BackgroundEventMethod.SynchronizeAccount:
        await this.synchronizeAccount(params as { accountId: string });
        break;
      case BackgroundEventMethod.SynchronizeAccountTransactions:
        await this.synchronizeAccountTransactions(
          params as { accountId: string },
        );
        break;
      case BackgroundEventMethod.RefreshConfirmationPrices:
        await this.refreshConfirmationPrices();
        break;
      default:
        throw new Error(`Unknown cronjob method: ${method}`);
    }
  }

  /**
   * A background job that continuously synchronizes selected accounts.
   * It schedules itself while the extension is active to make sure the data is fresh.
   */
  async continuouslySynchronizeSelectedAccounts(): Promise<void> {
    this.#logger.info('[Tick] Continuously synchronizing selected accounts...');

    await this.synchronizeSelectedAccounts();

    await this.#snapClient.scheduleBackgroundEvent({
      method: BackgroundEventMethod.ContinuouslySynchronizeSelectedAccounts,
      duration: 'PT30S',
    });
  }

  async synchronizeSelectedAccounts(): Promise<void> {
    this.#logger.info('Synchronizing selected accounts...');

    const accounts = await this.#accountsService.getAllSelected();

    await this.#accountsService.synchronize(accounts);
  }

  async synchronizeAccounts({
    accountIds,
  }: {
    accountIds: string[];
  }): Promise<void> {
    this.#logger.info(`Synchronizing accounts ${accountIds.join(', ')}...`);

    const accounts = await this.#accountsService.findByIds(accountIds);

    if (!accounts) {
      return;
    }

    await this.#accountsService.synchronize(accounts);
  }

  async synchronizeAccount({
    accountId,
  }: {
    accountId: string;
  }): Promise<void> {
    this.#logger.info(`Synchronizing account ${accountId}...`);

    const account = await this.#accountsService.findById(accountId);

    if (!account) {
      return;
    }

    await this.#accountsService.synchronize([account]);
  }

  async synchronizeAccountTransactions({
    accountId,
  }: {
    accountId: string;
  }): Promise<void> {
    this.#logger.info(`Synchronizing account transactions ${accountId}...`);

    const account = await this.#accountsService.findById(accountId);

    if (!account) {
      return;
    }

    await this.#accountsService.synchronizeTransactions([account]);
  }

  /**
   * Background job to refresh price data for confirmation dialogs.
   * Follows Solana's pattern: get interface ID from map, extract data from context.
   */
  async refreshConfirmationPrices(): Promise<void> {
    this.#logger.info('Background price refresh triggered for confirmation...');

    const mapInterfaceNameToId =
      (await this.#state.getKey<UnencryptedStateValue['mapInterfaceNameToId']>(
        'mapInterfaceNameToId',
      )) ?? {};

    const confirmationInterfaceId =
      mapInterfaceNameToId[CONFIRM_TRANSACTION_INTERFACE_NAME];

    // Don't do anything if the confirmation interface is not open
    if (!confirmationInterfaceId) {
      this.#logger.info('No active confirmation interface found');
      return;
    }

    // Get the current interface context (contains all data we need!)
    const interfaceContext =
      await this.#snapClient.getInterfaceContext<ConfirmTransactionRequestContext>(
        confirmationInterfaceId,
      );

    if (!interfaceContext) {
      this.#logger.info('Interface context no longer exists, cleaning up');
      await this.#state.setKey(
        `mapInterfaceNameToId.${CONFIRM_TRANSACTION_INTERFACE_NAME}`,
        null,
      );
      return;
    }

    try {
      // Extract CAIP IDs from context (main asset + fee assets)
      const assetCaipIds = [
        interfaceContext.asset.assetType,
        ...interfaceContext.fees.map((fee) => fee.asset.type),
      ];
      const uniqueAssetCaipIds = [...new Set(assetCaipIds)];

      // First, update UI to show loading skeletons (Solana pattern)
      const fetchingContext: ConfirmTransactionRequestContext = {
        ...interfaceContext,
        tokenPricesFetchStatus: 'fetching' as const,
      };

      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmTransactionRequest context={fetchingContext} />,
        fetchingContext,
      );

      // Fetch fresh prices
      this.#logger.info(
        `Fetching fresh prices for ${uniqueAssetCaipIds.length} assets`,
      );
      const prices = await this.#priceApiClient.getMultipleSpotPrices(
        uniqueAssetCaipIds as any,
        interfaceContext.preferences.currency,
      );

      // Update context with fresh prices
      const updatedContext: ConfirmTransactionRequestContext = {
        ...interfaceContext,
        tokenPrices: prices,
        tokenPricesFetchStatus: 'fetched' as const,
      };

      // Update the interface with new UI and context
      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmTransactionRequest context={updatedContext} />,
        updatedContext,
      );

      this.#logger.info('Successfully refreshed confirmation prices');

      // Schedule the next refresh (20 seconds like Solana)
      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.RefreshConfirmationPrices,
        duration: 'PT20S',
      });
    } catch (error) {
      this.#logger.error('Error refreshing confirmation prices:', error);

      // Try to update the UI to show error state if possible
      try {
        const currentContext =
          await this.#snapClient.getInterfaceContext<ConfirmTransactionRequestContext>(
            confirmationInterfaceId,
          );

        if (!currentContext) {
          return;
        }

        const errorContext: ConfirmTransactionRequestContext = {
          ...currentContext,
          tokenPricesFetchStatus: 'error' as const,
        };

        await this.#snapClient.updateInterface(
          confirmationInterfaceId,
          <ConfirmTransactionRequest context={errorContext} />,
          errorContext,
        );
      } catch {
        // Ignore errors when trying to update error state
      }

      // Don't schedule another refresh on error - the dialog might be gone
    }
  }
}
