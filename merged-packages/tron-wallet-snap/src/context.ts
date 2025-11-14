import { InMemoryCache } from './caching/InMemoryCache';
import { PriceApiClient } from './clients/price-api/PriceApiClient';
import { SnapClient } from './clients/snap/SnapClient';
import { TokenApiClient } from './clients/token-api/TokenApiClient';
import { TronHttpClient } from './clients/tron-http/TronHttpClient';
import { TrongridApiClient } from './clients/trongrid/TrongridApiClient';
import { TronWebFactory } from './clients/tronweb/TronWebFactory';
import { AssetsHandler } from './handlers/assets';
import { ClientRequestHandler } from './handlers/clientRequest/clientRequest';
import { CronHandler } from './handlers/cronjob';
import { KeyringHandler } from './handlers/keyring';
import { LifecycleHandler } from './handlers/lifecycle';
import { RpcHandler } from './handlers/rpc';
import { UserInputHandler } from './handlers/userInput';
import { AccountsRepository } from './services/accounts/AccountsRepository';
import { AccountsService } from './services/accounts/AccountsService';
import { AssetsRepository } from './services/assets/AssetsRepository';
import { AssetsService } from './services/assets/AssetsService';
import { ConfigProvider } from './services/config';
import { ConfirmationHandler } from './services/confirmation/ConfirmationHandler';
import { FeeCalculatorService } from './services/send/FeeCalculatorService';
import { SendService } from './services/send/SendService';
import { StakingService } from './services/staking/StakingService';
import type { UnencryptedStateValue } from './services/state/State';
import { State } from './services/state/State';
import { TransactionsRepository } from './services/transactions/TransactionsRepository';
import { TransactionsService } from './services/transactions/TransactionsService';
import logger, { noOpLogger } from './utils/logger';

/**
 * Services
 *
 * Dependency injection order:
 * 1. Core services (ConfigProvider, State, Connection)
 * 2. Repositories (AssetsRepository, TransactionsRepository, AccountsRepository)
 * 3. Business services (AssetsService, TransactionsService, AccountsService)
 * 4. Handlers (AssetsHandler, CronHandler, KeyringHandler, RpcHandler, UserInputHandler)
 */
export const configProvider = new ConfigProvider();

const state = new State({
  encrypted: false,
  defaultState: {
    keyringAccounts: {},
    assets: {},
    tokenPrices: {},
    transactions: {},
    mapInterfaceNameToId: {},
  },
});

const snapClient = new SnapClient();

// Repositories - depend on State
const accountsRepository = new AccountsRepository(state);
const assetsRepository = new AssetsRepository(state);
const transactionsRepository = new TransactionsRepository(state);

// Clients
const trongridApiClient = new TrongridApiClient({
  configProvider,
});
const tronHttpClient = new TronHttpClient({
  configProvider,
  logger,
});
const tronWebFactory = new TronWebFactory({
  configProvider,
});

// Cache for PriceApiClient
const priceCache = new InMemoryCache(noOpLogger);
const priceApiClient = new PriceApiClient(configProvider, priceCache);

// Token API client
const tokenApiClient = new TokenApiClient(configProvider);

// Business Services - depend on Repositories, State and other Services
const assetsService = new AssetsService({
  logger,
  state,
  assetsRepository,
  trongridApiClient,
  tronHttpClient,
  priceApiClient,
  tokenApiClient,
});

const transactionsService = new TransactionsService({
  logger,
  transactionsRepository,
  trongridApiClient,
});

const accountsService = new AccountsService({
  logger,
  snapClient,
  accountsRepository,
  configProvider,
  assetsService,
  transactionsService,
});

const feeCalculatorService = new FeeCalculatorService({
  logger,
  tronWebFactory,
  trongridApiClient,
});

const sendService = new SendService({
  logger,
  snapClient,
  accountsService,
  tronWebFactory,
});

const stakingService = new StakingService({
  logger,
  snapClient,
  accountsService,
  tronWebFactory,
});

const confirmationHandler = new ConfirmationHandler({
  snapClient,
  state,
});

/**
 * Handlers
 */
const assetsHandler = new AssetsHandler({
  logger,
  assetsService,
});
const clientRequestHandler = new ClientRequestHandler({
  logger,
  snapClient,
  accountsService,
  assetsService,
  sendService,
  tronWebFactory,
  feeCalculatorService,
  stakingService,
  confirmationHandler,
});
const cronHandler = new CronHandler({
  logger,
  snapClient,
  accountsService,
  state,
  priceApiClient,
});
const lifecycleHandler = new LifecycleHandler({
  logger,
  snapClient,
});
const keyringHandler = new KeyringHandler({
  logger,
  snapClient,
  accountsService,
  assetsService,
  transactionsService,
});
const rpcHandler = new RpcHandler();
const userInputHandler = new UserInputHandler({
  logger,
  snapClient,
});

export type SnapExecutionContext = {
  /**
   * Clients
   */
  snapClient: SnapClient;
  /**
   * Services
   */
  state: State<UnencryptedStateValue>;
  priceApiClient: PriceApiClient;
  feeCalculatorService: FeeCalculatorService;
  assetsService: AssetsService;
  accountsService: AccountsService;
  transactionsService: TransactionsService;
  sendService: SendService;
  tronHttpClient: TronHttpClient;
  tronWebFactory: TronWebFactory;
  confirmationHandler: ConfirmationHandler;
  /**
   * Handlers
   */
  assetsHandler: AssetsHandler;
  cronHandler: CronHandler;
  clientRequestHandler: ClientRequestHandler;
  lifecycleHandler: LifecycleHandler;
  keyringHandler: KeyringHandler;
  rpcHandler: RpcHandler;
  userInputHandler: UserInputHandler;
};

const snapContext: SnapExecutionContext = {
  /**
   * Clients
   */
  snapClient,
  /**
   * Services
   */
  state,
  priceApiClient,
  feeCalculatorService,
  assetsService,
  accountsService,
  transactionsService,
  sendService,
  tronHttpClient,
  tronWebFactory,
  confirmationHandler,
  /**
   * Handlers
   */
  assetsHandler,
  clientRequestHandler,
  cronHandler,
  lifecycleHandler,
  keyringHandler,
  rpcHandler,
  userInputHandler,
};

export {
  /**
   * Handlers
   */
  assetsHandler,
  clientRequestHandler,
  cronHandler,
  keyringHandler,
  lifecycleHandler,
  rpcHandler,
  userInputHandler,
};

export default snapContext;
