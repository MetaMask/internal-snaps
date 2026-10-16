import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import type { TronWeb } from 'tronweb';

import type { SnapClient } from '../clients/snap/SnapClient';
import type { TronWebFactory } from '../clients/tronweb/TronWebFactory';
import type { Network } from '../constants';
import { BackgroundEventMethod } from '../handlers/cronjob/cronjob';
import type { AccountsService } from '../services/accounts/AccountsService';
import type { TransactionExpirationRefresherService } from '../services/transaction-expiration-refresher/TransactionExpirationRefresherService';
import type { TransactionWithMetadata } from '../services/transaction-expiration-refresher/types';
import {
  isSuccessfulBroadcast,
  throwOnTransientBroadcastFailure,
} from './broadcast';

/**
 * Derives a keypair, creates an authenticated TronWeb client,
 * builds/signs/broadcasts each transaction, then schedules
 * an account synchronization background event.
 *
 * @param params - The parameters for the on-chain actions.
 * @param params.accountsService - Service to derive the keypair from the account.
 * @param params.tronWebFactory - Factory to create a TronWeb client.
 * @param params.snapClient - Client to schedule background events.
 * @param params.transactionExpirationRefresherService - Service that refreshes
 * transaction metadata immediately before signing.
 * @param params.account - The account to derive the keypair from.
 * @param params.scope - The network scope.
 * @param params.buildTransactions - Callback that receives an authenticated TronWeb
 * client and returns the transactions to sign and broadcast.
 */
export async function executeOnChainActions({
  accountsService,
  tronWebFactory,
  snapClient,
  transactionExpirationRefresherService,
  account,
  scope,
  buildTransactions,
}: {
  accountsService: AccountsService;
  tronWebFactory: TronWebFactory;
  snapClient: SnapClient;
  transactionExpirationRefresherService: TransactionExpirationRefresherService;
  account: ExtendedKeyringAccount;
  scope: Network;
  buildTransactions: (tronWeb: TronWeb) => Promise<unknown[]>;
}): Promise<void> {
  const { privateKeyHex } = await accountsService.deriveTronKeypair({
    entropySource: account.entropySource,
    derivationPath: account.derivationPath,
  });
  const tronWeb = tronWebFactory.createClient(scope, privateKeyHex);

  const transactions = await buildTransactions(tronWeb);
  let broadcastSucceeded = false;
  let actionError: unknown;
  try {
    for (const transaction of transactions) {
      const freshTransaction =
        await transactionExpirationRefresherService.ensureFreshMetadata({
          scope,
          transaction: transaction as TransactionWithMetadata,
        });
      const signedTx = await tronWeb.trx.sign(
        freshTransaction as Parameters<TronWeb['trx']['sign']>[0],
      );
      const result = await tronWebFactory.executeBroadcast(scope, async () =>
        throwOnTransientBroadcastFailure(
          await tronWeb.trx.sendRawTransaction(
            signedTx as Parameters<TronWeb['trx']['sendRawTransaction']>[0],
          ),
        ),
      );
      if (!isSuccessfulBroadcast(result)) {
        throw new Error(`Failed to send transaction: ${result.message}`);
      }
      broadcastSucceeded = true;
    }
  } catch (error) {
    actionError = error;
  }

  if (broadcastSucceeded || transactions.length === 0) {
    try {
      await snapClient.scheduleBackgroundEvent({
        method: BackgroundEventMethod.SynchronizeAccount,
        params: { accountId: account.id },
        duration: 'PT5S',
      });
    } catch (error) {
      if (actionError === undefined) {
        throw error;
      }
    }
  }

  if (actionError !== undefined) {
    throw actionError instanceof Error
      ? actionError
      : new Error('Action failed');
  }
}
