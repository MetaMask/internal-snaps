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
import { FeeCalculatorService } from './services/send/FeeCalculatorService';
import { SendService } from './services/send/SendService';
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
  accountsRepository,
  configProvider,
  assetsService,
  snapClient,
  transactionsService,
});

const feeCalculatorService = new FeeCalculatorService({
  logger,
  tronWebFactory,
  trongridApiClient,
});

const sendService = new SendService({
  logger,
  accountsService,
  tronWebFactory,
  snapClient,
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
  accountsService,
  assetsService,
  sendService,
  tronWebFactory,
  feeCalculatorService,
  snapClient,
});
const cronHandler = new CronHandler({
  logger,
  accountsService,
  snapClient,
});
const lifecycleHandler = new LifecycleHandler({
  logger,
  accountsService,
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
const userInputHandler = new UserInputHandler();

export type SnapExecutionContext = {
  /**
   * Services
   */
  state: State<UnencryptedStateValue>;
  assetsService: AssetsService;
  accountsService: AccountsService;
  transactionsService: TransactionsService;
  sendService: SendService;
  tronHttpClient: TronHttpClient;
  tronWebFactory: TronWebFactory;
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
   * Services
   */
  state,
  assetsService,
  accountsService,
  transactionsService,
  sendService,
  tronHttpClient,
  tronWebFactory,
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
