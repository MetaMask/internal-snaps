import { AssetsHandler } from './handlers/assets';
import { CronHandler } from './handlers/cronjob';
import { KeyringHandler } from './handlers/keyring';
import { RpcHandler } from './handlers/rpc';
import { UserInputHandler } from './handlers/userInput';
import { AccountsRepository } from './services/accounts/AccountsRepository';
import { AccountsService } from './services/accounts/AccountsService';
import { AssetsRepository } from './services/assets/AssetsRepository';
import { AssetsService } from './services/assets/AssetsService';
import { ConfigProvider } from './services/config';
import { Connection } from './services/connection/Connection';
import type { UnencryptedStateValue } from './services/state/State';
import { State } from './services/state/State';
import { TransactionsService } from './services/transactions/TransactionsService';
import { WalletService } from './services/wallet/WalletService';
import logger from './utils/logger';

/**
 * Services
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

const assetsRepository = new AssetsRepository(state);
const connection = new Connection(configProvider);

const assetsService = new AssetsService({
  logger,
  state,
  assetsRepository,
  connection,
});

const transactionService = new TransactionsService();

const walletService = new WalletService({
  logger,
  state,
});

const accountsRepository = new AccountsRepository(state);

const accountsService = new AccountsService(
  accountsRepository,
  configProvider,
  logger,
  connection,
  assetsService,
);

/**
 * Handlers
 */
const assetsHandler = new AssetsHandler();
const cronHandler = new CronHandler();
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
  transactionService: TransactionsService;
  walletService: WalletService;
  accountsService: AccountsService;
  /**
   * Handlers
   */
  assetsHandler: AssetsHandler;
  cronHandler: CronHandler;
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
  transactionService,
  walletService,
  accountsService,
  /**
   * Handlers
   */
  assetsHandler,
  cronHandler,
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
  rpcHandler,
  userInputHandler,
};

export default snapContext;
