import { InMemoryCache } from './caching/InMemoryCache';
import { PriceApiClient } from './clients/price-api/PriceApiClient';
import { SnapClient } from './clients/snap/SnapClient';
import { TronHttpClient } from './clients/tron-http/TronHttpClient';
import { TrongridApiClient } from './clients/trongrid/TrongridApiClient';
import { AssetsHandler } from './handlers/assets';
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
import type { UnencryptedStateValue } from './services/state/State';
import { State } from './services/state/State';
import { WalletService } from './services/wallet/WalletService';
import logger, { noOpLogger } from './utils/logger';

/**
 * Services
 *
 * Dependency injection order:
 * 1. Core services (ConfigProvider, State, Connection)
 * 2. Repositories (AssetsRepository, TransactionsRepository, AccountsRepository)
 * 3. Business services (AssetsService, TransactionsService, AccountsService, WalletService)
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
const assetsRepository = new AssetsRepository(state);
const trongridApiClient = new TrongridApiClient({
  configProvider,
});
const tronHttpClient = new TronHttpClient({
  configProvider,
});

// Cache for PriceApiClient
const priceCache = new InMemoryCache(noOpLogger);
const priceApiClient = new PriceApiClient(configProvider, priceCache);

// Business Services - depend on Repositories, State, Connection, and other Services
const assetsService = new AssetsService({
  logger,
  state,
  assetsRepository,
  trongridApiClient,
  tronHttpClient,
  priceApiClient,
});

const walletService = new WalletService({
  logger,
  state,
});

const accountsRepository = new AccountsRepository(state);

const accountsService = new AccountsService({
  accountsRepository,
  configProvider,
  logger,
  assetsService,
  snapClient,
});

/**
 * Handlers
 */
const assetsHandler = new AssetsHandler({
  logger,
  assetsService,
});
const cronHandler = new CronHandler({
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
  accountsService,
  assetsService,
});
const rpcHandler = new RpcHandler();
const userInputHandler = new UserInputHandler();

export type SnapExecutionContext = {
  /**
   * Services
   */
  state: State<UnencryptedStateValue>;
  assetsService: AssetsService;
  walletService: WalletService;
  accountsService: AccountsService;
  tronHttpClient: TronHttpClient;
  /**
   * Handlers
   */
  assetsHandler: AssetsHandler;
  cronHandler: CronHandler;
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
  walletService,
  accountsService,
  tronHttpClient,
  /**
   * Handlers
   */
  assetsHandler,
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
  cronHandler,
  keyringHandler,
  lifecycleHandler,
  rpcHandler,
  userInputHandler,
};

export default snapContext;
