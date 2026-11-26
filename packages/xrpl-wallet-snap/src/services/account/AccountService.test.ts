import type { Logger } from '@metamask/snap-networks-utils';
import type { Mock } from 'vitest';

import type { WalletService } from '../wallet';
import { AccountService } from './AccountService';
import type { AccountsRepository } from './AccountsRepository';

function createAccountServiceTest(): {
  service: AccountService;
  deleteAccount: Mock;
} {
  const deleteAccount = vi.fn().mockResolvedValue(undefined);

  const service = new AccountService({
    logger: {
      withPrefix() {
        return this;
      },
    } as unknown as Logger,
    accountsRepository: {
      delete: deleteAccount,
    } as unknown as AccountsRepository,
    walletService: {} as unknown as WalletService,
  });

  return { service, deleteAccount };
}

describe('AccountService', () => {
  describe('delete', () => {
    it.each(['account-id', 'missing-id'])(
      'deletes via the accounts repository for id %s',
      async (id) => {
        const { service, deleteAccount } = createAccountServiceTest();

        await service.delete(id);

        expect(deleteAccount).toHaveBeenCalledWith(id);
      },
    );
  });
});
