import {
  MOCK_SOLANA_KEYRING_ACCOUNT_0,
  MOCK_SOLANA_KEYRING_ACCOUNT_1,
} from '../../test/mocks/solana-keyring-accounts';
import { mockLogger } from '../__mocks__/logger';
import type { AssetsService } from '../assets/AssetsService';
import type { TransactionsService } from '../transactions';
import type { AccountsService } from './AccountsService';
import { AccountsSynchronizer } from './AccountsSynchronizer';

describe('AccountsSynchronizer', () => {
  let synchronizer: AccountsSynchronizer;
  let mockAccountsService: jest.Mocked<Pick<AccountsService, 'getAll'>>;
  let mockAssetsService: jest.Mocked<Pick<AssetsService, 'fetch' | 'saveMany'>>;
  let mockTransactionsService: jest.Mocked<
    Pick<TransactionsService, 'fetchAssetsTransactions' | 'saveMany'>
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAccountsService = {
      getAll: jest.fn().mockResolvedValue([MOCK_SOLANA_KEYRING_ACCOUNT_0]),
    };

    mockAssetsService = {
      fetch: jest.fn().mockResolvedValue([]),
      saveMany: jest.fn().mockResolvedValue(undefined),
    };

    mockTransactionsService = {
      fetchAssetsTransactions: jest.fn().mockResolvedValue([]),
      saveMany: jest.fn().mockResolvedValue(undefined),
    };

    synchronizer = new AccountsSynchronizer(
      mockAccountsService as unknown as AccountsService,
      mockAssetsService as unknown as AssetsService,
      mockTransactionsService as unknown as TransactionsService,
      mockLogger,
    );
  });

  describe('synchronize', () => {
    it('fetches and saves assets and transactions for provided accounts', async () => {
      await synchronizer.synchronize([MOCK_SOLANA_KEYRING_ACCOUNT_0]);

      expect(mockAssetsService.fetch).toHaveBeenCalledWith(
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );
      expect(mockAssetsService.saveMany).toHaveBeenCalledTimes(1);
      expect(
        mockTransactionsService.fetchAssetsTransactions,
      ).toHaveBeenCalledTimes(1);
      expect(mockTransactionsService.saveMany).toHaveBeenCalledTimes(1);
    });

    it('falls back to getAll when no accounts are provided', async () => {
      await synchronizer.synchronize();

      expect(mockAccountsService.getAll).toHaveBeenCalledTimes(1);
      expect(mockAssetsService.fetch).toHaveBeenCalledWith(
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );
    });

    it('coalesces concurrent calls for the same account set into one run', async () => {
      const accounts = [MOCK_SOLANA_KEYRING_ACCOUNT_0];

      // Delay the fetch so both calls are in-flight at the same time.
      let resolveFetch!: () => void;
      mockAssetsService.fetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = (): void => resolve([]);
        }),
      );

      const [p1, p2] = [
        synchronizer.synchronize(accounts),
        synchronizer.synchronize(accounts),
      ];
      resolveFetch();
      await Promise.all([p1, p2]);

      expect(mockAssetsService.fetch).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh run after settlement', async () => {
      const accounts = [MOCK_SOLANA_KEYRING_ACCOUNT_0];

      await synchronizer.synchronize(accounts);
      await synchronizer.synchronize(accounts);

      expect(mockAssetsService.fetch).toHaveBeenCalledTimes(2);
    });

    it('does not coalesce calls for different account sets', async () => {
      const accounts1 = [MOCK_SOLANA_KEYRING_ACCOUNT_0];
      const accounts2 = [MOCK_SOLANA_KEYRING_ACCOUNT_1];

      let resolveFetch1!: () => void;
      let resolveFetch2!: () => void;
      mockAssetsService.fetch
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFetch1 = (): void => resolve([]);
          }),
        )
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFetch2 = (): void => resolve([]);
          }),
        );

      const [p1, p2] = [
        synchronizer.synchronize(accounts1),
        synchronizer.synchronize(accounts2),
      ];
      resolveFetch1();
      resolveFetch2();
      await Promise.all([p1, p2]);

      expect(mockAssetsService.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
