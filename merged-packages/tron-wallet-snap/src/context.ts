import { AssetsHandler } from "./handlers/assets";
import { CronHandler } from "./handlers/cronjob";
import { KeyringHandler } from "./handlers/keyring";
import { RpcHandler } from "./handlers/rpc";
import { UserInputHandler } from "./handlers/userInput";
import { AssetsService } from "./services/assets/AssetsService";
import { ConfigProvider } from "./services/config";
import { State, UnencryptedStateValue } from "./services/state/State";
import { TransactionsService } from "./services/transactions/TransactionsService";
import { WalletService } from "./services/wallet/WalletService";
import logger from "./utils/logger";

/**
 * Services
 */
const configProvider = new ConfigProvider();

const state = new State({
  encrypted: false,
  defaultState: {
    keyringAccounts: {},
    assets: {},
    tokenPrices: {},
    transactions: {},
  },
});

const assetsService = new AssetsService({
  logger: logger,
  configProvider: configProvider,
  state: state,
});

const transactionService = new TransactionsService({
  logger: logger,
  state: state,
});

const walletService = new WalletService({
  logger: logger,
  state: state,
});

/**
 * Handlers
 */
const assetsHandler = new AssetsHandler();
const cronHandler = new CronHandler();
const keyringHandler = new KeyringHandler({
  logger: logger,
  state: state,
  assetsService: assetsService,
  transactionService: transactionService,
  walletService: walletService,
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
  /**
   * Handlers
   */
  assetsHandler: AssetsHandler;
  cronHandler: CronHandler;
  keyringHandler: KeyringHandler;
  rpcHandler: RpcHandler;
  userInputHandler: UserInputHandler;
}

const snapContext: SnapExecutionContext = {
  /**
   * Services
   */
  state,
  assetsService,
  transactionService,
  walletService,
  /**
   * Handlers
   */
  assetsHandler,
  cronHandler,
  keyringHandler,
  rpcHandler,
  userInputHandler
};

export {
  /**
   * Handlers
   */
  assetsHandler,
  cronHandler,
  keyringHandler,
  rpcHandler,
  userInputHandler
};

export default snapContext;
