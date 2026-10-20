import { AccountsService } from './AccountsService';

describe('AccountsService', () => {
  describe('getAllSelected', () => {
    it('returns the accounts whose ids are selected in the client', async () => {
      const account0 = { id: 'account-0' };
      const account1 = { id: 'account-1' };
      const mockAccountsRepository = {
        getAll: jest.fn().mockResolvedValue([account0, account1]),
      };
      const service = new AccountsService(
        mockAccountsRepository as unknown as never,
      );

      // The client reports the currently selected account ids.
      (globalThis as { snap?: unknown }).snap = {
        request: jest.fn().mockResolvedValue([account1.id]),
      };

      const result = await service.getAllSelected();

      expect(result).toStrictEqual([account1]);
    });

    it('returns an empty list when the client selected none of the accounts', async () => {
      const account0 = { id: 'account-0' };
      const mockAccountsRepository = {
        getAll: jest.fn().mockResolvedValue([account0]),
      };
      const service = new AccountsService(
        mockAccountsRepository as unknown as never,
      );

      (globalThis as { snap?: unknown }).snap = {
        request: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getAllSelected();

      expect(result).toStrictEqual([]);
    });
  });
});
