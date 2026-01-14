import type { ResolvedAccountAddress } from '@metamask/keyring-api';
import { SnapError } from '@metamask/snaps-sdk';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';
import { bytesToHex, hexToBytes, sha256 } from '@metamask/utils';

import type { TronWebFactory } from '../../clients/tronweb/TronWebFactory';
import type { Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities';
import {
  TronMultichainErrors,
  TronMultichainMethod,
} from '../../handlers/keyring-types';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import {
  ResolveAccountAddressRequestStruct,
  ResolveAccountAddressResponseStruct,
  SignMessageRequestStruct,
  SignMessageResponseStruct,
  SignTransactionRequestStruct,
} from '../../validation/structs';
import { validateRequest, validateResponse } from '../../validation/validators';
import type { AccountsService } from '../accounts/AccountsService';
/**
 * Service responsible for handling wallet operations like signing messages and transactions.
 */
export class WalletService {
  readonly #logger: ILogger;

  readonly #accountsService: AccountsService;

  readonly #tronWebFactory: TronWebFactory;

  constructor({
    logger,
    accountsService,
    tronWebFactory,
  }: {
    logger: ILogger;
    accountsService: AccountsService;
    tronWebFactory: TronWebFactory;
  }) {
    this.#logger = createPrefixedLogger(logger, '[💼 WalletService]');
    this.#accountsService = accountsService;
    this.#tronWebFactory = tronWebFactory;
  }

  /**
   * Handles wallet requests by routing them to the appropriate method.
   *
   * @param request - The wallet request containing method and parameters.
   * @param request.account - The account to use for signing.
   * @param request.scope - The scope to use for signing.
   * @param request.method - The method to execute (signMessage or signTransaction).
   * @param request.params - The parameters for the method.
   * @returns The result of the wallet operation.
   * @throws {SnapError} If the method is not supported or if there's an error.
   */
  async handleKeyringRequest({
    account,
    scope,
    method,
    params,
  }: {
    account: TronKeyringAccount;
    scope: Network;
    method: TronMultichainMethod;
    params: Json;
  }): Promise<{ signature: string }> {
    this.#logger.log('Handling wallet request', {
      method,
      accountId: account.id,
      scope,
      params,
    });

    try {
      switch (method) {
        case TronMultichainMethod.SignMessage:
          return await this.signMessage({ account, scope, params });
        case TronMultichainMethod.SignTransaction:
          return await this.signTransaction({ account, scope, params });
        default:
          throw new SnapError(
            'Unsupported wallet method',
            TronMultichainErrors.InvalidParams,
          );
      }
    } catch (error: any) {
      this.#logger.error({ error }, 'Error handling wallet request');

      // User rejected the request
      if (error.code === 4100 || error.message?.includes('rejected')) {
        throw new SnapError(
          TronMultichainErrors.UserRejected.message,
          TronMultichainErrors.UserRejected,
        );
      }

      // Invalid parameters
      if (error.code === 4001 || error.message?.includes('Invalid')) {
        throw new SnapError(
          error.message ?? TronMultichainErrors.InvalidParams.message,
          TronMultichainErrors.InvalidParams,
        );
      }

      // Unknown error
      throw new SnapError(
        error.message ?? TronMultichainErrors.UnknownError.message,
        TronMultichainErrors.UnknownError,
      );
    }
  }

  /**
   * Signs a plain text message with a Tron account.
   * The signature can be used to verify ownership of the account.
   *
   * @param request - The sign message request.
   * @param request.account - The account to sign with.
   * @param request.scope - The scope to use for signing.
   * @param request.params - The request parameters containing address and message.
   * @returns An object containing the signature.
   */
  async signMessage({
    account,
    scope,
    params,
  }: {
    account: TronKeyringAccount;
    scope: Network;
    params: Json;
  }): Promise<{ signature: string }> {
    try {
      // Validate the params structure
      validateRequest(params, SignMessageRequestStruct);

      const { address, message } = params;

      // Derive the private key for signing
      const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
        entropySource: account.entropySource,
        derivationPath: account.derivationPath,
      });

      // Create a TronWeb instance for message signing
      // We can use any network since we're just signing a message
      const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

      // Decode the base64 message to get the raw message
      // eslint-disable-next-line no-restricted-globals
      const decodedMessage = Buffer.from(message, 'base64').toString('utf8');

      // Sign the message using TronWeb's signMessageV2
      const signature = tronWeb.trx.signMessageV2(
        decodedMessage,
        privateKeyHex,
      );

      const result = {
        signature,
      };

      validateResponse(result, SignMessageResponseStruct);

      this.#logger.log('Message signed successfully', { address });

      return result;
    } catch (error: any) {
      this.#logger.error({ error }, 'Error signing message');
      throw error;
    }
  }

  /**
   * Signs a Tron transaction.
   * The transaction rawDataHex must be provided as a hex-encoded string.
   *
   * @param request - The sign transaction request.
   * @param request.account - The account to sign with.
   * @param request.scope - The scope to use for signing.
   * @param request.params - The request parameters containing scope, address, and transaction.
   * @returns An object containing the signature.
   */
  async signTransaction({
    account,
    scope,
    params,
  }: {
    account: TronKeyringAccount;
    scope: Network;
    params: Json;
  }): Promise<{ signature: string }> {
    try {
      // Validate the params structure
      validateRequest(params, SignTransactionRequestStruct);

      const {
        address,
        transaction: { rawDataHex, type },
      } = params;

      // Derive the private key for signing
      const { privateKeyHex } = await this.#accountsService.deriveTronKeypair({
        entropySource: account.entropySource,
        derivationPath: account.derivationPath,
      });

      // Create a TronWeb instance for transaction signing
      const tronWeb = this.#tronWebFactory.createClient(scope, privateKeyHex);

      // Rebuild the transaction from hex (same logic as clientRequest handler)
      const rawData = tronWeb.utils.deserializeTx.deserializeTransaction(
        type,
        rawDataHex,
      );
      const txID = bytesToHex(await sha256(hexToBytes(rawDataHex))).slice(2);
      const transaction = {
        visible: false,
        txID,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        raw_data: rawData,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        raw_data_hex: rawDataHex,
      };

      // Sign the rebuilt transaction
      const signedTx = await tronWeb.trx.sign(transaction, privateKeyHex);

      // Extract the signature from the signed transaction
      // signedTx.signature is an array of hex strings
      const signatureArray = (signedTx as any).signature as string[];
      const signature = signatureArray?.[0] ?? '';

      const result = {
        signature: `0x${signature}`,
      };

      this.#logger.log('Transaction signed successfully', { address, scope });

      return result;
    } catch (error: any) {
      this.#logger.error({ error }, 'Error signing transaction');

      // Check if it's a transaction format error
      if (
        error.message?.includes('deserialize') ||
        error.message?.includes('parse') ||
        error.message?.includes('invalid')
      ) {
        throw new SnapError(
          `Invalid transaction format: ${error.message}`,
          TronMultichainErrors.InvalidTransaction,
        );
      }

      throw error;
    }
  }

  /**
   * Resolves the address of an account from a signing request.
   *
   * This is required by the routing system of MetaMask to dispatch
   * incoming non-EVM dapp signing requests.
   *
   * @param keyringAccounts - The accounts available in the keyring.
   * @param scope - Request's scope (CAIP-2 chain ID).
   * @param request - Signing request object.
   * @returns A Promise that resolves to the account address in CAIP-10 format
   * that must be used to process this signing request.
   * @throws If the request is invalid or no matching account is found.
   */
  async resolveAccountAddress(
    keyringAccounts: TronKeyringAccount[],
    scope: Network,
    request: JsonRpcRequest,
  ): Promise<ResolvedAccountAddress> {
    this.#logger.log('Resolving account address', {
      accountCount: keyringAccounts.length,
      scope,
      request,
    });

    // Filter accounts that support this scope
    const accountsWithThisScope = keyringAccounts.filter((account) =>
      account.scopes.includes(scope),
    );

    if (accountsWithThisScope.length === 0) {
      throw new Error(`No accounts with scope: ${scope}`);
    }

    // Validate the request structure (method and params)
    validateRequest(request, ResolveAccountAddressRequestStruct);

    // Extract the params from the validated request
    const { params } = request;

    // Validate that address exists in params
    const { address } = params as any;
    if (!address || typeof address !== 'string') {
      throw new Error('Address parameter is required and must be a string');
    }

    const addressToValidate = address;

    // Validate that the address is a valid Tron address
    const tronWeb = this.#tronWebFactory.createClient(scope);

    const isValid = tronWeb.isAddress(addressToValidate);
    if (!isValid) {
      throw new Error(`Invalid Tron address: ${addressToValidate}`);
    }

    // Find the account in the keyring that matches the address
    const foundAccount = accountsWithThisScope.find(
      (account) => account.address === addressToValidate,
    );

    if (!foundAccount) {
      throw new Error(
        `Account not found in keyring for address: ${addressToValidate}`,
      );
    }

    // Return the address in CAIP-10 format
    // CAIP-10 format: chainId:address (e.g., "tron:0x2b6653dc:TJRabPrwbZy45sbavfcjinPJC18kjpRTv8")
    const caip10Address =
      `${scope}:${addressToValidate}` as ResolvedAccountAddress['address'];

    // Validate the response format
    validateResponse(caip10Address, ResolveAccountAddressResponseStruct);

    this.#logger.log('Address resolved successfully', {
      address: addressToValidate,
      caip10Address,
      accountId: foundAccount.id,
    });

    return {
      address: caip10Address,
    };
  }
}
