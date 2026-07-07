import type { JsonRpcRequest } from '@metamask/snaps-sdk';

import type { PriceApiClient } from '../clients/price-api/PriceApiClient';
import type { SnapClient } from '../clients/snap/SnapClient';
import type { TronHttpClient } from '../clients/tron-http/TronHttpClient';
import type { Network } from '../constants';
import type { TronKeyringAccount } from '../entities/keyring-account';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { State, UnencryptedStateValue } from '../services/state/State';
import type { TransactionExpirationRefresherService } from '../services/transaction-expiration-refresher/TransactionExpirationRefresherService';
import type {
  JsonTransactionRawData,
  TransactionRawData,
} from '../services/transaction-expiration-refresher/types';
import { EXPIRED_TRANSACTION_SCAN } from '../services/transaction-scan/buildExpiredScanResult';
import type { TransactionScanService } from '../services/transaction-scan/TransactionScanService';
import { FetchStatus } from '../types/snap';
import { ConfirmSignTransaction } from '../ui/confirmation/views/ConfirmSignTransaction/ConfirmSignTransaction';
import {
  CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME,
  type ConfirmSignTransactionContext,
} from '../ui/confirmation/views/ConfirmSignTransaction/types';
import { ConfirmTransactionRequest } from '../ui/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import {
  CONFIRM_TRANSACTION_INTERFACE_NAME,
  type ConfirmTransactionRequestContext,
} from '../ui/confirmation/views/ConfirmTransactionRequest/types';
import type { ILogger } from '../utils/logger';
import { createPrefixedLogger } from '../utils/logger';

export enum CronjobMethod {
  ContinuouslySynchronizeSelectedAccounts = 'onSynchronizeSelectedAccountsCronjob',
}

export enum BackgroundEventMethod {
  SynchronizeSelectedAccounts = 'onSynchronizeSelectedAccounts',
  SynchronizeAccounts = 'onSynchronizeAccounts',
  SynchronizeAccount = 'onSynchronizeAccount',
  SynchronizeAccountTransactions = 'onSynchronizeAccountTransactions',
  RefreshConfirmationPrices = 'refreshConfirmationPrices',
  RefreshConfirmationSend = 'refreshConfirmationSend',
  RefreshSignTransaction = 'refreshSignTransaction',
  TrackTransaction = 'onTrackTransaction',
}

export class CronHandler {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #snapClient: SnapClient;

  readonly #state: State<UnencryptedStateValue>;

  readonly #priceApiClient: PriceApiClient;

  readonly #tronHttpClient: TronHttpClient;

  readonly #transactionScanService: TransactionScanService;

  readonly #transactionExpirationRefresherService: TransactionExpirationRefresherService;

  constructor({
    logger,
    accountsService,
    snapClient,
    state,
    priceApiClient,
    tronHttpClient,
    transactionScanService,
    transactionExpirationRefresherService,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    snapClient: SnapClient;
    state: State<UnencryptedStateValue>;
    priceApiClient: PriceApiClient;
    tronHttpClient: TronHttpClient;
    transactionScanService: TransactionScanService;
    transactionExpirationRefresherService: TransactionExpirationRefresherService;
  }) {
    this.#logger = createPrefixedLogger(logger, '[⏰ CronHandler]');
    this.#accountsService = accountsService;
    this.#snapClient = snapClient;
    this.#state = state;
    this.#priceApiClient = priceApiClient;
    this.#tronHttpClient = tronHttpClient;
    this.#transactionScanService = transactionScanService;
    this.#transactionExpirationRefresherService =
      transactionExpirationRefresherService;
  }

  async handle(request: JsonRpcRequest): Promise<void> {
    const { method, params } = request;
    const { active, locked } = await this.#snapClient.getClientStatus();

    if (!active || locked) {
      return;
    }

    switch (method as CronjobMethod | BackgroundEventMethod) {
      case CronjobMethod.ContinuouslySynchronizeSelectedAccounts:
        await this.synchronizeSelectedAccounts();
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
      case BackgroundEventMethod.RefreshConfirmationSend:
        await this.refreshConfirmationSend();
        break;
      case BackgroundEventMethod.RefreshSignTransaction:
        await this.refreshSignTransaction();
        break;
      case BackgroundEventMethod.TrackTransaction:
        await this.trackTransaction(
          params as {
            txId: string;
            scope: Network;
            accountIds: string[];
            attempt: number;
          },
        );
        break;
      default:
        throw new Error(`Unknown cronjob method: ${method}`);
    }
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

    if (accounts.length === 0) {
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
   * Background job to refresh price data for transaction request confirmation dialogs.
   * Follows Solana's pattern: get interface ID from map, extract data from context.
   */
  async refreshConfirmationPrices(): Promise<void> {
    this.#logger.info('Background price refresh triggered for confirmation...');

    const mapInterfaceNameToId =
      (await this.#state.getKey<UnencryptedStateValue['mapInterfaceNameToId']>(
        'mapInterfaceNameToId',
      )) ?? {};

    const transactionRequestInterfaceId =
      mapInterfaceNameToId[CONFIRM_TRANSACTION_INTERFACE_NAME];

    if (!transactionRequestInterfaceId) {
      this.#logger.info('No active transaction request interface found');
      return;
    }

    await this.#refreshTransactionRequestPrices(transactionRequestInterfaceId);
  }

  /**
   * Refresh prices for ConfirmTransactionRequest interface.
   *
   * @param confirmationInterfaceId - The interface ID to refresh.
   */
  async #refreshTransactionRequestPrices(
    confirmationInterfaceId: string,
  ): Promise<void> {
    const interfaceContext =
      await this.#snapClient.getInterfaceContext<ConfirmTransactionRequestContext>(
        confirmationInterfaceId,
      );

    if (!interfaceContext) {
      this.#logger.info('Interface context no longer exists, skipping refresh');
      return;
    }

    try {
      const assetCaipIds = [
        interfaceContext.asset.assetType,
        ...interfaceContext.fees.map((fee) => fee.asset.type),
      ];
      const uniqueAssetCaipIds = [...new Set(assetCaipIds)];

      const fetchingContext: ConfirmTransactionRequestContext = {
        ...interfaceContext,
        tokenPricesFetchStatus: FetchStatus.Fetching,
      };

      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmTransactionRequest context={fetchingContext} />,
        fetchingContext,
      );

      this.#logger.info(
        `Fetching fresh prices for ${uniqueAssetCaipIds.length} assets`,
      );
      const prices = await this.#priceApiClient.getMultipleSpotPrices(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        uniqueAssetCaipIds as any,
        interfaceContext.preferences.currency,
      );

      const latestContext =
        await this.#snapClient.getInterfaceContext<ConfirmTransactionRequestContext>(
          confirmationInterfaceId,
        );

      if (!latestContext) {
        this.#logger.info(
          'Interface context no longer exists after fetch, skipping update',
        );
        return;
      }

      const updatedContext: ConfirmTransactionRequestContext = {
        ...latestContext,
        tokenPrices: prices,
        tokenPricesFetchStatus: FetchStatus.Fetched,
      };

      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmTransactionRequest context={updatedContext} />,
        updatedContext,
      );

      this.#logger.info('Successfully refreshed confirmation prices');

      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.RefreshConfirmationPrices,
        duration: 'PT20S',
      });
    } catch (error) {
      this.#logger.warn({ error }, 'Could not refresh confirmation prices');
    }
  }

  /**
   * Background job to refresh the security scan for simple send confirmation dialogs.
   */
  async refreshConfirmationSend(): Promise<void> {
    this.#logger.info(
      'Background scan refresh triggered for send confirmation...',
    );

    const mapInterfaceNameToId =
      (await this.#state.getKey<UnencryptedStateValue['mapInterfaceNameToId']>(
        'mapInterfaceNameToId',
      )) ?? {};

    const confirmationInterfaceId =
      mapInterfaceNameToId[CONFIRM_TRANSACTION_INTERFACE_NAME];

    if (!confirmationInterfaceId) {
      this.#logger.info('No active send confirmation interface found');
      return;
    }

    const interfaceContext =
      await this.#snapClient.getInterfaceContext<ConfirmTransactionRequestContext>(
        confirmationInterfaceId,
      );

    if (!interfaceContext) {
      this.#logger.info('Interface context no longer exists, skipping refresh');
      return;
    }

    if (!interfaceContext.fromAddress || !interfaceContext.scope) {
      this.#logger.info('Context is missing required fields for scan refresh');
      return;
    }

    const { preferences, scope, fromAddress, origin } = interfaceContext;
    const transactionRawData =
      interfaceContext.transactionRawData as JsonTransactionRawData | null;

    if (!transactionRawData) {
      this.#logger.info(
        'Context is missing transactionRawData for scan refresh',
      );
      return;
    }

    try {
      const fetchingContext: ConfirmTransactionRequestContext = {
        ...interfaceContext,
        scanFetchStatus: FetchStatus.Fetching,
      };

      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmTransactionRequest context={fetchingContext} />,
        fetchingContext,
      );

      const options: string[] = ['simulation'];
      if (preferences.useSecurityAlerts) {
        options.push('validation');
      }

      const scanAccount = {
        type: interfaceContext.accountType,
        address: fromAddress,
      } as TronKeyringAccount;

      let { scan } = interfaceContext;
      let { scanFetchStatus } = interfaceContext;
      let freshTransactionRawData = transactionRawData;

      try {
        freshTransactionRawData =
          await this.#transactionExpirationRefresherService.ensureFreshRawData({
            scope,
            rawData: transactionRawData,
          });

        scan = await this.#transactionScanService.scanTransaction({
          accountAddress: fromAddress,
          transactionRawData: freshTransactionRawData,
          origin,
          scope,
          options,
          account: scanAccount,
        });
        scanFetchStatus = scan ? FetchStatus.Fetched : FetchStatus.Error;
        this.#logger.info('Successfully refreshed send confirmation scan');
      } catch (error) {
        this.#logger.error('Error refreshing send confirmation scan:', error);
        scan = null;
        scanFetchStatus = FetchStatus.Error;
      }

      const latestContext =
        await this.#snapClient.getInterfaceContext<ConfirmTransactionRequestContext>(
          confirmationInterfaceId,
        );

      if (!latestContext) {
        this.#logger.info(
          'Interface context no longer exists after scan, skipping update',
        );
        return;
      }

      const updatedContext: ConfirmTransactionRequestContext = {
        ...latestContext,
        scan,
        scanFetchStatus,
        transactionRawData: freshTransactionRawData,
      };

      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmTransactionRequest context={updatedContext} />,
        updatedContext,
      );

      this.#logger.info('Successfully refreshed send confirmation');

      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.RefreshConfirmationSend,
        duration: 'PT20S',
      });
    } catch (error) {
      this.#logger.warn({ error }, 'Could not refresh send confirmation');
    }
  }

  /**
   * Background job to refresh security scan for signTransaction confirmation dialogs.
   */
  async refreshSignTransaction(): Promise<void> {
    this.#logger.info(
      'Background refresh triggered for signTransaction confirmation...',
    );

    const mapInterfaceNameToId =
      (await this.#state.getKey<UnencryptedStateValue['mapInterfaceNameToId']>(
        'mapInterfaceNameToId',
      )) ?? {};

    const confirmationInterfaceId =
      mapInterfaceNameToId[CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME];

    if (!confirmationInterfaceId) {
      this.#logger.info(
        'No active signTransaction confirmation interface found',
      );
      return;
    }

    const interfaceContext =
      await this.#snapClient.getInterfaceContext<ConfirmSignTransactionContext>(
        confirmationInterfaceId,
      );

    if (!interfaceContext) {
      this.#logger.info('Interface context no longer exists, skipping refresh');
      return;
    }

    if (
      !interfaceContext.account?.address ||
      !interfaceContext.transaction ||
      !interfaceContext.scope
    ) {
      this.#logger.info('Context is missing required fields');
      return;
    }

    const { preferences, scope, account, origin, transaction } =
      interfaceContext;

    const shouldRefreshScan =
      preferences.simulateOnChainActions || preferences.useSecurityAlerts;

    try {
      const fetchingContext: ConfirmSignTransactionContext = {
        ...interfaceContext,
        scanFetchStatus: shouldRefreshScan
          ? FetchStatus.Fetching
          : interfaceContext.scanFetchStatus,
      };

      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmSignTransaction context={fetchingContext} />,
        fetchingContext,
      );

      let { scan, scanFetchStatus } = interfaceContext;

      // Deserialize the original payload once (read-only) for both the security
      // re-scan and the local TAPOS-expiry check. The payload itself is never
      // refreshed — re-scanning the unchanged transaction is what surfaces
      // expiration over time in the warning banner.
      let rawData: TransactionRawData | null = null;
      try {
        const deserialized =
          await this.#transactionExpirationRefresherService.deserializeTransaction(
            {
              scope,
              type: transaction.type,
              rawDataHex: transaction.rawDataHex,
            },
          );
        rawData = deserialized.raw_data;
      } catch (error) {
        this.#logger.error(
          'Error deserializing transaction for signTransaction refresh:',
          error,
        );
        await this.#snapClient.trackError(error as Error);
      }

      if (shouldRefreshScan && rawData) {
        const options: string[] = [];
        if (preferences.simulateOnChainActions) {
          options.push('simulation');
        }
        if (preferences.useSecurityAlerts) {
          options.push('validation');
        }

        try {
          scan = await this.#transactionScanService.scanTransaction({
            accountAddress: account.address,
            transactionRawData: rawData,
            origin,
            scope,
            options,
            account,
          });
          scanFetchStatus = scan ? FetchStatus.Fetched : FetchStatus.Error;
          this.#logger.info('Successfully refreshed signTransaction scan');
        } catch (error) {
          this.#logger.error('Error refreshing signTransaction scan:', error);
          scan = null;
          scanFetchStatus = FetchStatus.Error;
        }
      }

      // Local TAPOS-expiry check: protocol-level validity, independent of the
      // security preferences. The security-API simulation does not validate
      // Tron TAPOS fields, so the snap surfaces expiry itself. It takes
      // precedence over a benign scan — an expired transaction won't broadcast
      // regardless of the contract simulation result.
      if (rawData) {
        try {
          const expired =
            await this.#transactionExpirationRefresherService.isTransactionExpired(
              {
                scope,
                rawData,
              },
            );

          if (expired) {
            scan = EXPIRED_TRANSACTION_SCAN;
            scanFetchStatus = FetchStatus.Fetched;
          }
        } catch (error) {
          this.#logger.error('Error checking transaction expiration:', error);
          await this.#snapClient.trackError(error as Error);
        }
      }

      const latestContext =
        await this.#snapClient.getInterfaceContext<ConfirmSignTransactionContext>(
          confirmationInterfaceId,
        );

      if (!latestContext) {
        this.#logger.info(
          'Interface context no longer exists after scan, skipping update',
        );
        return;
      }

      const updatedContext: ConfirmSignTransactionContext = {
        ...latestContext,
        scan,
        scanFetchStatus,
      };

      await this.#snapClient.updateInterface(
        confirmationInterfaceId,
        <ConfirmSignTransaction context={updatedContext} />,
        updatedContext,
      );

      this.#logger.info('Successfully refreshed signTransaction confirmation');

      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.RefreshSignTransaction,
        duration: 'PT20S',
      });
    } catch (error) {
      this.#logger.warn({ error }, 'Could not refresh signTransaction');
    }
  }

  /**
   * Background job to track a transaction's confirmation status.
   * Syncs accounts on first check to fetch transaction with status from network.
   * Continues polling until confirmed, then syncs again to update status.
   * Implements automatic retry logic with exponential backoff limits.
   *
   * @param params - Transaction tracking parameters
   * @param params.txId - The transaction ID to track
   * @param params.scope - The network scope (e.g., 'mainnet', 'shasta')
   * @param params.accountIds - Account IDs to sync after confirmation (first account is always the sender)
   * @param params.attempt - Current attempt number (for retry logic)
   */
  async trackTransaction({
    txId,
    scope,
    accountIds,
    attempt = 0,
  }: {
    txId: string;
    scope: Network;
    accountIds: string[];
    attempt: number;
  }): Promise<void> {
    const maxAttempts = 15; // Maximum number of polling attempts
    const pollingInterval = 'PT1S'; // Poll every 1 second

    this.#logger.info(
      `[Attempt ${attempt + 1} of ${maxAttempts}] Tracking transaction ${txId} on ${scope}...`,
    );

    // Check if we've exceeded maximum attempts
    if (attempt >= maxAttempts) {
      this.#logger.warn(
        { txId, scope, attempts: maxAttempts },
        'Transaction tracking timeout - syncing accounts',
      );

      // Fallback: sync accounts anyway to update final status
      const accounts = await this.#accountsService.findByIds(accountIds);
      if (accounts.length > 0) {
        await this.#accountsService.synchronize(accounts);
      }
      return;
    }

    try {
      // Fetch transaction info from Full Node API
      // Note: This endpoint only returns data for confirmed transactions
      const txInfo = await this.#tronHttpClient.getTransactionInfoById(
        scope,
        txId,
      );

      // If transaction not found yet (not confirmed), schedule next check
      if (!txInfo) {
        this.#logger.info(
          { txId, attempt },
          'Transaction not confirmed yet, scheduling next check...',
        );

        await this.#snapClient.scheduleBackgroundEvent({
          method: BackgroundEventMethod.TrackTransaction,
          params: {
            txId,
            scope,
            accountIds,
            attempt: attempt + 1,
          },
          duration: pollingInterval,
        });
        return;
      }

      // Transaction found! This means it's confirmed on-chain
      this.#logger.log(
        { txId, blockNumber: txInfo.blockNumber, scope },
        '✅ Transaction confirmed on-chain',
      );

      // Get the sender account to determine account type
      const accounts = await this.#accountsService.findByIds(accountIds);
      const senderAccount = accounts[0];

      if (!senderAccount) {
        this.#logger.error({ txId }, 'Sender account not found');
        return;
      }

      // Synchronize accounts to get the full transaction details and update state
      // Scheduled in the background to avoid blocking the main thread
      await this.#snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.SynchronizeSelectedAccounts,
        duration: 'PT1S',
      });

      // Track Transaction Finalized event now that transaction is confirmed
      await this.#snapClient.trackTransactionFinalized({
        origin: 'MetaMask',
        accountType: senderAccount.type,
        chainIdCaip: scope,
      });
    } catch (error) {
      this.#logger.error(
        { error, txId, scope, attempt },
        'Error tracking transaction',
      );

      // On error, retry with next attempt (unless we've hit max attempts)
      if (attempt < maxAttempts - 1) {
        await this.#snapClient.scheduleBackgroundEvent({
          method: BackgroundEventMethod.TrackTransaction,
          params: {
            txId,
            scope,
            accountIds,
            attempt: attempt + 1,
          },
          duration: pollingInterval,
        });
      } else {
        // Max attempts reached - fallback to sync
        this.#logger.warn(
          { txId, scope },
          'Max tracking attempts reached with errors - falling back to account sync',
        );
        const accounts = await this.#accountsService.findByIds(accountIds);
        if (accounts.length > 0) {
          await this.#accountsService.synchronize(accounts);
        }
      }
    }
  }
}
