import { SynchronizationError } from '@metamask/snap-networks-utils';

import {
  MOCK_ASSET_ENTITY_0,
  MOCK_ASSET_ENTITY_1,
} from '../../test/mocks/asset-entities';
import {
  MOCK_SOLANA_KEYRING_ACCOUNT_0,
  MOCK_SOLANA_KEYRING_ACCOUNT_1,
} from '../../test/mocks/solana-keyring-accounts';
import { trackError } from '../../utils/errors';
import { mockLogger } from '../__mocks__/logger';
import type { AssetsService } from '../assets/AssetsService';
import type { TransactionsService } from '../transactions';
import type { AccountsService } from './AccountsService';
import { AccountsSynchronizer } from './AccountsSynchronizer';

jest.mock('../../utils/errors');

describe('AccountsSynchronizer', () => {
  let synchronizer: AccountsSynchronizer;
  let mockAccountsService: jest.Mocked<Pick<AccountsService, 'getAll'>>;
  let mockAssetsService: jest.Mocked<
    Pick<AssetsService, 'fetchAccountAssets' | 'saveMany'>
  >;
  let mockTransactionsService: jest.Mocked<
    Pick<TransactionsService, 'fetchAssetsTransactions' | 'saveMany'>
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    (trackError as jest.Mock).mockResolvedValue('tracked-error-id');

    mockAccountsService = {
      getAll: jest.fn().mockResolvedValue([MOCK_SOLANA_KEYRING_ACCOUNT_0]),
    };

    mockAssetsService = {
      fetchAccountAssets: jest.fn().mockResolvedValue([]),
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

      expect(mockAssetsService.fetchAccountAssets).toHaveBeenCalledWith(
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
      expect(mockAssetsService.fetchAccountAssets).toHaveBeenCalledWith(
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );
    });

    it('coalesces concurrent calls for the same account set into one run', async () => {
      const accounts = [MOCK_SOLANA_KEYRING_ACCOUNT_0];

      // Delay the fetch so both calls are in-flight at the same time.
      let resolveFetch!: () => void;
      mockAssetsService.fetchAccountAssets.mockReturnValueOnce(
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

      expect(mockAssetsService.fetchAccountAssets).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh run after settlement', async () => {
      const accounts = [MOCK_SOLANA_KEYRING_ACCOUNT_0];

      await synchronizer.synchronize(accounts);
      await synchronizer.synchronize(accounts);

      expect(mockAssetsService.fetchAccountAssets).toHaveBeenCalledTimes(2);
    });

    it('does not coalesce calls for different account sets', async () => {
      const accounts1 = [MOCK_SOLANA_KEYRING_ACCOUNT_0];
      const accounts2 = [MOCK_SOLANA_KEYRING_ACCOUNT_1];

      let resolveFetch1!: () => void;
      let resolveFetch2!: () => void;
      mockAssetsService.fetchAccountAssets
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

      expect(mockAssetsService.fetchAccountAssets).toHaveBeenCalledTimes(2);
    });

    it('reports per-account fetch failures and saves only successful assets', async () => {
      const accounts = [
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
        MOCK_SOLANA_KEYRING_ACCOUNT_1,
      ];
      const fetchError = new Error('fetch failed');
      mockAssetsService.fetchAccountAssets
        .mockRejectedValueOnce(fetchError)
        .mockResolvedValueOnce([MOCK_ASSET_ENTITY_1]);

      await synchronizer.synchronize(accounts);

      expect(trackError).toHaveBeenCalledTimes(1);
      const error = (trackError as jest.Mock).mock.calls[0][0] as Error;
      expect(error).toBeInstanceOf(SynchronizationError);
      expect(error.message).toBe(
        'Account synchronization failures (1 failed): ' +
          `${MOCK_SOLANA_KEYRING_ACCOUNT_0.id}: Error: fetch failed`,
      );

      // Only the successful account's assets are saved.
      expect(mockAssetsService.saveMany).toHaveBeenCalledWith([
        MOCK_ASSET_ENTITY_1,
      ]);
      expect(mockTransactionsService.saveMany).toHaveBeenCalledTimes(1);
    });

    it('tracks asset save failures standalone and propagates them', async () => {
      const saveError = new Error('storage unavailable');
      mockAssetsService.fetchAccountAssets.mockResolvedValueOnce([
        MOCK_ASSET_ENTITY_0,
      ]);
      mockAssetsService.saveMany.mockRejectedValueOnce(saveError);

      const rejection = await synchronizer
        .synchronize()
        .catch((caught: unknown) => caught);

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to save assets',
          cause: saveError,
        }),
      );
      // The original error is rethrown, aborting the rest of the run.
      expect(rejection).toBe(saveError);
      expect(
        mockTransactionsService.fetchAssetsTransactions,
      ).not.toHaveBeenCalled();
    });

    it('tracks transaction fetch failures standalone and propagates them', async () => {
      const fetchError = new Error('rpc down');
      mockTransactionsService.fetchAssetsTransactions.mockRejectedValueOnce(
        fetchError,
      );

      const rejection = await synchronizer
        .synchronize()
        .catch((caught: unknown) => caught);

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to fetch transactions',
          cause: fetchError,
        }),
      );
      expect(rejection).toBe(fetchError);
      expect(mockTransactionsService.saveMany).not.toHaveBeenCalled();
    });

    it('tracks transaction save failures standalone and propagates them', async () => {
      const saveError = new Error('storage unavailable');
      mockTransactionsService.saveMany.mockRejectedValueOnce(saveError);

      const rejection = await synchronizer
        .synchronize()
        .catch((caught: unknown) => caught);

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to save transactions',
          cause: saveError,
        }),
      );
      expect(rejection).toBe(saveError);
    });

    it('does not throw when reporting failures fails', async () => {
      const fetchError = new Error('fetch failed');
      mockAssetsService.fetchAccountAssets.mockRejectedValueOnce(fetchError);
      (trackError as jest.Mock).mockRejectedValueOnce(
        new Error('tracking down'),
      );

      await synchronizer.synchronize([MOCK_SOLANA_KEYRING_ACCOUNT_0]);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
