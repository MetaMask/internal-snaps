import { normalizeError } from '@metamask/snap-networks-utils';
import type { Logger } from '@metamask/snap-networks-utils';
import { add0x } from '@metamask/utils';

import type { AccountService } from '../../services/account';
import { assertSameAddress } from '../../services/account';
import type { StellarKeyringAccount } from '../../services/account';
import type { WalletService } from '../../services/wallet';
import { BaseHandler } from '../base';
import type {
  SignProofOfOwnershipBatchJsonRpcRequest,
  SignProofOfOwnershipBatchJsonRpcResponse,
} from './api';
import {
  SignProofOfOwnershipBatchJsonRpcRequestStruct,
  SignProofOfOwnershipBatchJsonRpcResponseStruct,
} from './api';
import type { IClientRequestHandler } from './base';
import { parseProofOfOwnershipMessage } from './utils';

/**
 * Validated proof-of-ownership signing request with its original input index.
 */
type SigningRequest = {
  /**
   * Original batch item index, used to preserve response ordering.
   */
  index: number;

  /**
   * Account ID from the original request item.
   */
  accountId: string;

  /**
   * Resolved Stellar account used for address validation and wallet lookup.
   */
  account: StellarKeyringAccount;

  /**
   * Plaintext proof-of-ownership message to sign.
   */
  message: string;
};

/**
 * Handles silent batch signing of proof-of-ownership messages.
 *
 * Used by `@metamask/profile-metrics-controller` to prove wallet control for
 * multiple Stellar accounts in a single Snap request. This is a silent sign
 * path: it intentionally skips the regular sign-message confirmation flow.
 */
export class SignProofOfOwnershipBatchHandler
  extends BaseHandler<
    SignProofOfOwnershipBatchJsonRpcRequest,
    SignProofOfOwnershipBatchJsonRpcResponse
  >
  implements IClientRequestHandler
{
  readonly #accountService: AccountService;

  readonly #walletService: WalletService;

  constructor({
    logger,
    accountService,
    walletService,
  }: {
    logger: Logger;
    accountService: AccountService;
    walletService: WalletService;
  }) {
    super({
      logger: logger.withPrefix('[🔏 SignProofOfOwnershipBatchHandler]'),
      requestStruct: SignProofOfOwnershipBatchJsonRpcRequestStruct,
      responseStruct: SignProofOfOwnershipBatchJsonRpcResponseStruct,
    });
    this.#accountService = accountService;
    this.#walletService = walletService;
  }

  /**
   * Validates each request item, derives wallets grouped by entropy source, and
   * returns one success or error result per input item.
   *
   * @param request - The JSON-RPC batch proof-of-ownership request.
   * @returns Batch proof-of-ownership signing results in input order.
   */
  protected async handleRequest(
    request: SignProofOfOwnershipBatchJsonRpcRequest,
  ): Promise<SignProofOfOwnershipBatchJsonRpcResponse> {
    const { items } = request.params;
    const uniqueAccountIds = [
      ...new Set(items.map(({ accountId }) => accountId)),
    ];
    const accounts = await this.#accountService.findByIds(uniqueAccountIds);
    const accountsById = new Map(
      accounts.map((account) => [account.id.toLowerCase(), account]),
    );
    const results: SignProofOfOwnershipBatchJsonRpcResponse['results'] =
      new Array(items.length);
    const signingRequests: SigningRequest[] = [];

    items.forEach(({ accountId, message }, index) => {
      const account = accountsById.get(accountId.toLowerCase());
      if (account === undefined) {
        results[index] = {
          accountId,
          error: `Account not found: ${accountId}`,
        };
        return;
      }

      try {
        const { address: messageAddress } =
          parseProofOfOwnershipMessage(message);

        if (messageAddress !== account.address) {
          results[index] = {
            accountId,
            error: `Address in proof-of-ownership message (${messageAddress}) does not match signing account address (${account.address})`,
          };
          return;
        }

        signingRequests.push({
          index,
          accountId,
          account,
          message,
        });
      } catch (error) {
        results[index] = {
          accountId,
          error: normalizeError(error).message,
        };
      }
    });

    await this.#signValidRequests(signingRequests, results);

    return { results };
  }

  /**
   * Signs already-validated requests, grouping wallet derivation by entropy
   * source so the coin-type node is fetched once per source.
   *
   * @param signingRequests - Requests that passed account and message checks.
   * @param results - Mutable output array indexed to match the original input.
   */
  async #signValidRequests(
    signingRequests: SigningRequest[],
    results: SignProofOfOwnershipBatchJsonRpcResponse['results'],
  ): Promise<void> {
    const requestsByEntropySource = new Map<string, SigningRequest[]>();
    for (const signingRequest of signingRequests) {
      const entropyRequests =
        requestsByEntropySource.get(signingRequest.account.entropySource) ?? [];
      entropyRequests.push(signingRequest);
      requestsByEntropySource.set(
        signingRequest.account.entropySource,
        entropyRequests,
      );
    }

    await Promise.all(
      [...requestsByEntropySource.values()].map(
        async (entropySourceRequests) => {
          const firstRequest = entropySourceRequests[0] as SigningRequest;
          const { entropySource } = firstRequest.account;

          try {
            const walletResolver =
              await this.#walletService.getWalletResolver(entropySource);

            for (const {
              account,
              accountId,
              index,
              message,
            } of entropySourceRequests) {
              try {
                const wallet = await walletResolver(account.index);
                assertSameAddress(account.address, wallet.address);
                results[index] = {
                  accountId,
                  signature: add0x(wallet.signMessage(message, 'hex')),
                };
              } catch (error) {
                results[index] = {
                  accountId,
                  error: normalizeError(error).message,
                };
              }
            }
          } catch (error) {
            for (const { accountId, index } of entropySourceRequests) {
              results[index] = {
                accountId,
                error: normalizeError(error).message,
              };
            }
          }
        },
      ),
    );
  }
}
