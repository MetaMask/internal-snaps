import type { Transaction } from '@metamask/keyring-api';

import type { TronKeyringAccount } from '../../entities';

export class TransactionsService {
  async listTransactions(_account: TronKeyringAccount): Promise<Transaction[]> {
    return []; // TODO: Implement me
  }
}
