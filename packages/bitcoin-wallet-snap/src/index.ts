import { handleKeyringRequest } from '@metamask/keyring-snap-sdk/v2';
import type {
  OnCronjobHandler,
  OnKeyringRequestHandler,
  OnUserInputHandler,
  OnClientRequestHandler,
  OnActiveHandler,
} from '@metamask/snaps-sdk';

import { Config } from './config';
import {
  KeyringHandler,
  CronHandler,
  UserInputHandler,
  RpcHandler,
} from './handlers';
import { HandlerMiddleware } from './handlers/HandlerMiddleware';
import { KeyringRequestHandler } from './handlers/KeyringRequestHandler';
import {
  SnapClientAdapter,
  EsploraClientAdapter,
  PriceApiClientAdapter,
  LocalTranslatorAdapter,
} from './infra';
import { BdkAccountRepository, JSXSendFlowRepository } from './store';
import { JSXConfirmationRepository } from './store/JSXConfirmationRepository';
import {
  AccountUseCases,
  ConfirmationUseCases,
  SendFlowUseCases,
} from './use-cases';
import logger from './utils/logger';

// Infra layer
const snapClient = new SnapClientAdapter(logger, Config.encrypt);
const chainClient = new EsploraClientAdapter(Config.chain);
const assetRatesClient = new PriceApiClientAdapter(Config.priceApi);
const translator = new LocalTranslatorAdapter();
const middleware = new HandlerMiddleware(logger, snapClient, translator);

// Data layer
const accountRepository = new BdkAccountRepository(snapClient);
const sendFlowRepository = new JSXSendFlowRepository(snapClient, translator);
const confirmationRepository = new JSXConfirmationRepository(
  snapClient,
  translator,
  chainClient,
  assetRatesClient,
  logger,
);

// Business layer
const accountsUseCases = new AccountUseCases(
  logger,
  snapClient,
  accountRepository,
  confirmationRepository,
  chainClient,
  Config.fallbackFeeRate,
  Config.targetBlocksConfirmation,
);
const sendFlowUseCases = new SendFlowUseCases(
  logger,
  snapClient,
  accountRepository,
  accountsUseCases,
  sendFlowRepository,
  chainClient,
  assetRatesClient,
  Config.targetBlocksConfirmation,
  Config.fallbackFeeRate,
  Config.ratesRefreshInterval,
);
const confirmationUseCases = new ConfirmationUseCases(logger, snapClient);

// Application layer
const keyringRequestHandler = new KeyringRequestHandler(
  accountsUseCases,
  confirmationRepository,
);
const keyringHandler = new KeyringHandler(
  keyringRequestHandler,
  accountsUseCases,
  Config.defaultAddressType,
  snapClient,
  logger,
);
const cronHandler = new CronHandler(
  accountsUseCases,
  sendFlowUseCases,
  snapClient,
  snap,
);
const rpcHandler = new RpcHandler(sendFlowUseCases, accountsUseCases, logger);
const userInputHandler = new UserInputHandler(
  sendFlowUseCases,
  confirmationUseCases,
);

export const onCronjob: OnCronjobHandler = async ({ request }) =>
  middleware.handle(async () => cronHandler.route(request));

export const onClientRequest: OnClientRequestHandler = async ({ request }) =>
  middleware.handle(async () => rpcHandler.route('metamask', request));

export const onKeyringRequest: OnKeyringRequestHandler = async ({ request }) =>
  middleware.handle(
    async () => (await handleKeyringRequest(keyringHandler, request)) ?? null,
  );

export const onUserInput: OnUserInputHandler = async ({ id, event, context }) =>
  middleware.handle(async () => userInputHandler.route(id, event, context));

export const onActive: OnActiveHandler = async () =>
  middleware.handle(async () => cronHandler.synchronizeAccounts());
