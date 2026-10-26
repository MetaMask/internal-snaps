import {
  AnalyticsService,
  AssetsProvider,
  createFetchPolicy,
  InMemoryCache,
  RemoteFeatureFlagsProvider,
  SecurityAlertsApiClient,
  State,
} from '@metamask/snap-networks-utils';
import type {
  AssetsProviderMessenger,
  IStateManager,
  RemoteFeatureFlagsProviderMessenger,
} from '@metamask/snap-networks-utils';
import { getMessenger } from '@metamask/snaps-sdk';

import { NftApiClient } from './core/clients/nft-api/NftApiClient';
import { PriceApiClient } from './core/clients/price-api/PriceApiClient';
import { TokenApiClient } from './core/clients/token-api-client/TokenApiClient';
import { ClientRequestHandler } from './core/handlers';
import { SolanaKeyring } from './core/handlers/onKeyringRequest/Keyring';
import {
  AccountsRepository,
  AccountsService,
  AccountsSynchronizer,
  ApproveTokenService,
  CoreAssetsAdapter,
  SnapAssetsAdapter,
  AssetsRepository,
  AssetsService,
  KeyringAccountMonitor,
  MonitoredAccountsInitializer,
  RecipientClassifier,
  SendService,
  SendSolBuilder,
  SendSplTokenBuilder,
  SignatureMonitor,
  Signer,
  SubscriptionRepository,
  SubscriptionService,
  TokenHelper,
  TransactionMapper,
  TransactionsRepository,
  TransactionsService,
  WebSocketConnectionRepository,
  WebSocketConnectionService,
} from './core/services';
import { configProvider } from './core/services/config';
import type { ConfigProvider } from './core/services/config';
import { ConfirmationHandler } from './core/services/confirmation/ConfirmationHandler';
import { SolanaConnection } from './core/services/connection/SolanaConnection';
import { NameResolutionService } from './core/services/name-resolution/NameResolutionService';
import { registerStateMigration } from './core/services/state/registerStateMigration';
import { DEFAULT_UNENCRYPTED_STATE } from './core/services/state/stateTypes';
import type { UnencryptedStateValue } from './core/services/state/stateTypes';
import { TransactionScanService } from './core/services/transaction-scan/TransactionScanService';
import { WalletService } from './core/services/wallet/WalletService';
import type { CoreMessenger } from './core/types/core-messenger';
import { trackError } from './core/utils/errors';
import logger, { noOpLogger } from './core/utils/logger';
import { getSnapProvider } from './core/utils/snap';
import { EventEmitter } from './infrastructure';

/**
 * Initializes all the services using dependency injection.
 */

export type SnapExecutionContext = {
  configProvider: ConfigProvider;
  connection: SolanaConnection;
  keyring: SolanaKeyring;
  priceApiClient: PriceApiClient;
  state: IStateManager<UnencryptedStateValue>;
  assetsService: AssetsService;
  signer: Signer;
  transactionsService: TransactionsService;
  sendSolBuilder: SendSolBuilder;
  sendSplTokenBuilder: SendSplTokenBuilder;
  walletService: WalletService;
  transactionScanService: TransactionScanService;
  analyticsService: AnalyticsService;
  confirmationHandler: ConfirmationHandler;
  clientRequestHandler: ClientRequestHandler;
  webSocketConnectionService: WebSocketConnectionService;
  subscriptionService: SubscriptionService;
  eventEmitter: EventEmitter;
  nameResolutionService: NameResolutionService;
  accountsService: AccountsService;
  accountsSynchronizer: AccountsSynchronizer;
  tokenHelper: TokenHelper;
};

const eventEmitter = new EventEmitter(logger);

const state = new State({
  encrypted: false,
  defaultState: DEFAULT_UNENCRYPTED_STATE,
});

registerStateMigration(eventEmitter, state);

const inMemoryCache = new InMemoryCache(noOpLogger);

const analyticsService = new AnalyticsService({
  getSnapProvider,
  logger,
  trackError,
});

const connection = new SolanaConnection(configProvider, inMemoryCache, logger);

const webSocketConnectionRepository = new WebSocketConnectionRepository(
  configProvider,
);

const webSocketConnectionService = new WebSocketConnectionService(
  webSocketConnectionRepository,
  analyticsService,
  configProvider,
  state,
  eventEmitter,
  logger,
);

const subscriptionRepository = new SubscriptionRepository(state);

const subscriptionService = new SubscriptionService(
  webSocketConnectionService,
  subscriptionRepository,
  eventEmitter,
  logger,
);

const tokenHelper = new TokenHelper(connection);

const signer = new Signer(connection, logger);

const sendSolBuilder = new SendSolBuilder(connection, logger);

const recipientClassifier = new RecipientClassifier(connection, logger);

const sendSplTokenBuilder = new SendSplTokenBuilder(
  tokenHelper,
  recipientClassifier,
  connection,
  logger,
);

const priceApiClient = new PriceApiClient(configProvider, inMemoryCache);
const tokenApiClient = new TokenApiClient(configProvider);
const nftApiClient = new NftApiClient(configProvider, inMemoryCache);

const nameResolutionService = new NameResolutionService(connection, logger);

const assetsRepository = new AssetsRepository(state);

const accountsRepository = new AccountsRepository(state);
const accountsService = new AccountsService(accountsRepository);

const snapAssetsAdapter = new SnapAssetsAdapter({
  connection,
  logger,
  configProvider,
  assetsRepository,
  accountsService,
  tokenApiClient,
  cache: inMemoryCache,
  nftApiClient,
});

/**
 * Core controllers plumbing
 */
const coreMessenger = getMessenger<CoreMessenger>();
const remoteFeatureFlagsProvider = new RemoteFeatureFlagsProvider({
  messenger: coreMessenger as RemoteFeatureFlagsProviderMessenger,
});
const assetsProvider = new AssetsProvider({
  messenger: coreMessenger as AssetsProviderMessenger,
});

const coreAssetsAdapter = new CoreAssetsAdapter({
  getAccountAssetByID: assetsProvider.getAccountAssetByID.bind(assetsProvider),
  getAccountAssetsByIDs:
    assetsProvider.getAccountAssetsByIDs.bind(assetsProvider),
  getAccountAssetsByScope:
    assetsProvider.getAccountAssetsByScope.bind(assetsProvider),
});

const assetsService = new AssetsService({
  snapAdapter: snapAssetsAdapter,
  coreAdapter: coreAssetsAdapter,
  remoteFeatureFlagsProvider,
});

const transactionsRepository = new TransactionsRepository(state);
const transactionMapper = new TransactionMapper(
  tokenHelper,
  assetsService,
  logger,
);
const transactionsService = new TransactionsService(
  transactionsRepository,
  transactionMapper,
  accountsService,
  assetsService,
  connection,
);

const accountsSynchronizer = new AccountsSynchronizer(
  accountsService,
  assetsService,
  transactionsService,
  logger,
);

const securityAlertsApiClient = new SecurityAlertsApiClient({
  scanUrl: `${configProvider.config.securityAlertsApi.baseUrl}/solana/message/scan`,
  policy: createFetchPolicy({
    service: 'security_alerts_api',
    logger,
  }),
});

const transactionScanService = new TransactionScanService({
  securityAlertsApiClient,
  analyticsService,
  logger,
  trackError,
});

const confirmationHandler = new ConfirmationHandler();

const signatureMonitor = new SignatureMonitor(
  subscriptionService,
  accountsService,
  transactionsService,
  analyticsService,
  connection,
  logger,
);

const keyringAccountMonitor = new KeyringAccountMonitor(
  subscriptionService,
  accountsService,
  assetsService,
  transactionsService,
  accountsSynchronizer,
  tokenHelper,
  configProvider,
  logger,
);

const monitoredAccountsInitializer = new MonitoredAccountsInitializer(
  accountsService,
  keyringAccountMonitor,
  eventEmitter,
  logger,
);

const walletService = new WalletService(
  connection,
  signer,
  signatureMonitor,
  analyticsService,
  transactionsService,
  logger,
);

const keyring = new SolanaKeyring({
  state,
  transactionsService,
  logger,
  assetsService,
  walletService,
  confirmationHandler,
  keyringAccountMonitor,
});

const sendService = new SendService(
  connection,
  keyring,
  logger,
  inMemoryCache,
  recipientClassifier,
  sendSolBuilder,
  sendSplTokenBuilder,
  assetsService,
);

const approveTokenService = new ApproveTokenService(
  connection,
  tokenHelper,
  logger,
);

const clientRequestHandler = new ClientRequestHandler(
  accountsService,
  walletService,
  logger,
  sendService,
  approveTokenService,
);

const snapContext: SnapExecutionContext = {
  configProvider,
  connection,
  keyring,
  priceApiClient,
  state,
  /* Services */
  assetsService,
  signer,
  transactionsService,
  sendSolBuilder,
  sendSplTokenBuilder,
  walletService,
  transactionScanService,
  analyticsService,
  confirmationHandler,
  clientRequestHandler,
  webSocketConnectionService,
  subscriptionService,
  eventEmitter,
  nameResolutionService,
  accountsService,
  accountsSynchronizer,
  tokenHelper,
};

export {
  accountsService,
  accountsSynchronizer,
  analyticsService,
  assetsService,
  clientRequestHandler,
  connection,
  eventEmitter,
  keyring,
  nameResolutionService,
  priceApiClient,
  state,
  transactionScanService,
  webSocketConnectionService,
};

export default snapContext;
