import { InMemoryCache } from './core/caching/InMemoryCache';
import { NftApiClient } from './core/clients/nft-api/NftApiClient';
import { PriceApiClient } from './core/clients/price-api/PriceApiClient';
import { SecurityAlertsApiClient } from './core/clients/security-alerts-api/SecurityAlertsApiClient';
import { TokenApiClient } from './core/clients/token-api-client/TokenApiClient';
import { ClientRequestHandler } from './core/handlers';
import { SolanaKeyring } from './core/handlers/onKeyringRequest/Keyring';
import {
  AccountsRepository,
  AccountsService,
  AccountsSynchronizer,
  ApproveTokenService,
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
import { AnalyticsService } from './core/services/analytics/AnalyticsService';
import { ConfigProvider } from './core/services/config';
import { ConfirmationHandler } from './core/services/confirmation/ConfirmationHandler';
import { SolanaConnection } from './core/services/connection/SolanaConnection';
import { NameResolutionService } from './core/services/name-resolution/NameResolutionService';
import type { IStateManager } from './core/services/state/IStateManager';
import type { UnencryptedStateValue } from './core/services/state/State';
import { DEFAULT_UNENCRYPTED_STATE, State } from './core/services/state/State';
import { TransactionScanService } from './core/services/transaction-scan/TransactionScan';
import { WalletService } from './core/services/wallet/WalletService';
import logger, { noOpLogger } from './core/utils/logger';
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

const configProvider = new ConfigProvider();

const eventEmitter = new EventEmitter(logger);

const state = new State(eventEmitter, {
  encrypted: false,
  defaultState: DEFAULT_UNENCRYPTED_STATE,
});

const inMemoryCache = new InMemoryCache(noOpLogger);

const analyticsService = new AnalyticsService(logger);

const connection = new SolanaConnection(configProvider, inMemoryCache);

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

const assetsService = new AssetsService({
  snapAdapter: snapAssetsAdapter,
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

const transactionScanService = new TransactionScanService(
  new SecurityAlertsApiClient(configProvider),
  analyticsService,
  logger,
);

const confirmationHandler = new ConfirmationHandler();

const signatureMonitor = new SignatureMonitor(
  subscriptionService,
  accountsService,
  transactionsService,
  analyticsService,
  connection,
  configProvider,
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
  accountsSynchronizer,
  analyticsService,
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
