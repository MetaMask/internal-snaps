import type { TronWeb } from 'tronweb';

import type { SnapClient } from '../clients/snap/SnapClient';
import type { TronWebFactory } from '../clients/tronweb/TronWebFactory';
import type { Network } from '../constants';
import type { TronKeyringAccount } from '../entities/keyring-account';
import { BackgroundEventMethod } from '../handlers/cronjob';
import type { AccountsService } from '../services/accounts/AccountsService';

/**
 * Derives a keypair, creates an authenticated TronWeb client,
 * builds/signs/broadcasts each transaction, then schedules
 * an account synchronization background event.
 *
 * @param params - The parameters for the on-chain actions.
 * @param params.accountsService - Service to derive the keypair from the account.
 * @param params.tronWebFactory - Factory to create a TronWeb client.
 * @param params.snapClient - Client to schedule background events.
 * @param params.account - The account to derive the keypair from.
 * @param params.scope - The network scope.
 * @param params.buildTransactions - Callback that receives an authenticated TronWeb
 * client and returns the transactions to sign and broadcast.
 */
export async function executeOnChainActions({
  accountsService,
  tronWebFactory,
  snapClient,
  account,
  scope,
  buildTransactions,
}: {
  accountsService: AccountsService;
  tronWebFactory: TronWebFactory;
  snapClient: SnapClient;
  account: TronKeyringAccount;
  scope: Network;
  buildTransactions: (tronWeb: TronWeb) => Promise<unknown[]>;
}): Promise<void> {
  const { privateKeyHex } = await accountsService.deriveTronKeypair({
    entropySource: account.entropySource,
    derivationPath: account.derivationPath,
  });
  const tronWeb = tronWebFactory.createClient(scope, privateKeyHex);

  const transactions = await buildTransactions(tronWeb);
  for (const transaction of transactions) {
    const signedTx = await tronWeb.trx.sign(
      transaction as Parameters<TronWeb['trx']['sign']>[0],
    );
    await tronWeb.trx.sendRawTransaction(
      signedTx as Parameters<TronWeb['trx']['sendRawTransaction']>[0],
    );
  }

  await snapClient.scheduleBackgroundEvent({
    method: BackgroundEventMethod.SynchronizeAccount,
    params: { accountId: account.id },
    duration: 'PT5S',
  });
}
