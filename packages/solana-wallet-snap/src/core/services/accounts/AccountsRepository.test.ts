import { InMemoryState } from '@metamask/snap-networks-utils';

import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import { DEFAULT_UNENCRYPTED_STATE } from '../state/stateTypes';
import { AccountsRepository } from './AccountsRepository';

describe('AccountsRepository', () => {
  describe('findByIds', () => {
    it('matches account IDs case-insensitively', async () => {
      const state = new InMemoryState({
        ...DEFAULT_UNENCRYPTED_STATE,
        keyringAccounts: {
          [MOCK_SOLANA_KEYRING_ACCOUNT_0.id]: MOCK_SOLANA_KEYRING_ACCOUNT_0,
        },
      });
      const repository = new AccountsRepository(state);

      const accounts = await repository.findByIds([
        MOCK_SOLANA_KEYRING_ACCOUNT_0.id.toUpperCase(),
      ]);

      expect(accounts).toStrictEqual([MOCK_SOLANA_KEYRING_ACCOUNT_0]);
    });
  });
});
