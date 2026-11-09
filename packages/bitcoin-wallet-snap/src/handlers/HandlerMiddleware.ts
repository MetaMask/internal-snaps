import {
  DisconnectedError,
  InternalError,
  InvalidInputError,
  InvalidParamsError,
  MethodNotFoundError,
  ResourceNotFoundError,
  UnauthorizedError,
  UserRejectedRequestError,
  SnapError,
  getErrorMessage,
} from '@metamask/snaps-sdk';
import { StructError } from 'superstruct';

import type { Translator, Logger, SnapClient } from '../entities';
import {
  BaseError,
  ExternalServiceError,
  FormatError,
  InexistentMethodError,
  NotFoundError,
  PermissionError,
  StorageError,
  UserActionError,
  ValidationError,
  WalletError,
  AssertionError,
  isBalanceNotSynchronizedError,
} from '../entities';
import { trackError } from '../utils/errors';

export class HandlerMiddleware {
  readonly #logger: Logger;

  readonly #snapClient: SnapClient;

  readonly #translator: Translator;

  constructor(logger: Logger, snapClient: SnapClient, translator: Translator) {
    this.#logger = logger;
    this.#snapClient = snapClient;
    this.#translator = translator;
  }

  async handle<ResponseT>(fn: () => Promise<ResponseT>): Promise<ResponseT> {
    try {
      return await fn();
    } catch (error) {
      // An account that has not synchronized yet is an expected state, not a
      // failure: it is still returned to the caller, but not reported. Match
      // the stable message marker, not the class: `handleKeyringRequest`
      // re-creates the error as a plain `Error` before it gets here.
      const isExpectedState = isBalanceNotSynchronizedError(error);
      if (!isExpectedState) {
        await trackError(error);
      }

      const { locale } = await this.#snapClient.getPreferences();
      const messages = await this.#translator.load(locale);

      if (error instanceof BaseError) {
        if (isExpectedState) {
          this.#logger.debug(error.message, error.data);
        } else {
          this.#logger.error(error, error.data);
        }

        const errMsg =
          messages[`error.${error.code}`]?.message ??
          messages['error.internal']?.message ??
          'Internal error';

        /* eslint-disable @typescript-eslint/only-throw-error */
        // User errors that he can rectify: Equivalent to 4xx errors
        if (error instanceof FormatError) {
          throw new InvalidInputError(
            `${errMsg}: ${error.message}`,
            error.data,
          );
        } else if (error instanceof ValidationError) {
          throw new InvalidParamsError(
            `${errMsg}: ${error.message}`,
            error.data,
          );
        } else if (error instanceof NotFoundError) {
          throw new ResourceNotFoundError(
            `${errMsg}: ${error.message}`,
            error.data,
          );
        } else if (error instanceof InexistentMethodError) {
          throw new MethodNotFoundError(
            `${errMsg}: ${error.message}`,
            error.data,
          );
        } else if (error instanceof PermissionError) {
          throw new UnauthorizedError(
            `${errMsg}: ${error.message}`,
            error.data,
          );
        } else if (error instanceof UserActionError) {
          throw new UserRejectedRequestError(
            `${errMsg}: ${error.message}`,
            error.data,
          );

          // Internal errors that we should not expose to the user: Equivalent to 5xx errors
        } else if (error instanceof ExternalServiceError) {
          throw new DisconnectedError(
            `${errMsg}: ${error.message}`,
            error.data,
          );
        } else if (
          error instanceof WalletError ||
          error instanceof StorageError ||
          error instanceof AssertionError
        ) {
          throw new InternalError(errMsg, error.data);
        } else {
          throw new InternalError(errMsg, error.data);
        }
      } else {
        if (error instanceof StructError) {
          const errMsg = messages['error.0']?.message ?? 'Invalid format';
          throw new InvalidInputError(
            `${errMsg}: ${error.message}`,
            error.data,
          );
        }
        // Unknown error type — wrap in SnapError to preserve the original
        // error's message and class info for observability (previously this
        // branch replaced everything with a generic "Unexpected error"
        // string, making cross-boundary errors like KeyringControllerError
        // opaque in Sentry).
        if (isExpectedState) {
          this.#logger.debug(getErrorMessage(error));
        } else {
          this.#logger.error(error);
        }
        throw new SnapError(
          error instanceof Error ? error : getErrorMessage(error),
        );
      }
    }
  }
}
