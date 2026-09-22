import { analyticsService, keyring } from '../../../../snapContext';
import { Network } from '../../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../test/mocks/solana-keyring-accounts';
import { onTransactionAdded } from './onTransactionAdded';
import { onTransactionApproved } from './onTransactionApproved';
import { onTransactionRejected } from './onTransactionRejected';
import { ScheduleBackgroundEventMethod } from './ScheduleBackgroundEventMethod';

jest.mock('../../../../snapContext', () => ({
  analyticsService: {
    trackTransactionAdded: jest.fn(),
    trackTransactionApproved: jest.fn(),
    trackTransactionRejected: jest.fn(),
  },
  keyring: {
    getAccountOrThrow: jest.fn(),
  },
}));

describe('transaction background events', () => {
  const origin = 'https://example.com';
  const account = MOCK_SOLANA_KEYRING_ACCOUNT_0;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(keyring.getAccountOrThrow).mockResolvedValue(account);
  });

  it.each([
    {
      handler: onTransactionAdded,
      method: ScheduleBackgroundEventMethod.OnTransactionAdded,
      track: 'trackTransactionAdded',
    },
    {
      handler: onTransactionApproved,
      method: ScheduleBackgroundEventMethod.OnTransactionApproved,
      track: 'trackTransactionApproved',
    },
    {
      handler: onTransactionRejected,
      method: ScheduleBackgroundEventMethod.OnTransactionRejected,
      track: 'trackTransactionRejected',
    },
  ] as const)('tracks $method', async ({ handler, method, track }) => {
    await handler({
      request: {
        id: '1',
        jsonrpc: '2.0',
        method,
        params: {
          accountId: account.id,
          metadata: {
            scope: Network.Mainnet,
            origin,
          },
        },
      },
    });

    expect(keyring.getAccountOrThrow).toHaveBeenCalledWith(account.id);
    expect(analyticsService[track]).toHaveBeenCalledWith({
      origin,
      accountType: account.type,
      chainIdCaip: Network.Mainnet,
    });
  });
});
