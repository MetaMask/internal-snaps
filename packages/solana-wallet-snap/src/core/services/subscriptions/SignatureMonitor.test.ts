/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Transaction } from '@metamask/keyring-api';
import { TransactionType } from '@metamask/keyring-api';
import type { AnalyticsService } from '@metamask/snap-networks-utils';
import type { Mock } from 'vitest';

import type {
  ConnectionRecoveryHandler,
  SignatureNotification,
  SignatureNotificationHandler,
  Subscription,
} from '../../../entities';
import { Network } from '../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNTS } from '../../test/mocks/solana-keyring-accounts';
import * as Errors from '../../utils/errors';
import { trackError } from '../../utils/errors';
import { mockLogger } from '../__mocks__/logger';
import type { AccountsService } from '../accounts';
import type { SolanaConnection } from '../connection';
import type { TransactionsService } from '../transactions';
import { SignatureMonitor } from './SignatureMonitor';
import type { SubscriptionService } from './SubscriptionService';

describe('SignatureMonitor', () => {
  let signatureMonitor: SignatureMonitor;
  let mockSubscriptionService: SubscriptionService;
  let mockAccountService: AccountsService;
  let mockTransactionsService: TransactionsService;
  let mockAnalyticsService: AnalyticsService;
  let mockConnection: SolanaConnection;

  const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNTS[0];

  const signature =
    '4s3KAUEZ9N5uwKurHNApnCSXVd6UxPD4VuHFtjcdT4WyXk5g5ZuscqqyJCjgssm81rL2BbjhJULHwBoe5jbNx5yS';
  const accountId = mockAccount.id;
  const commitment = 'confirmed' as const;
  const network = Network.Mainnet;
  const origin = 'test';

  const mockTransaction = {
    id: signature,
    chain: network,
    status: 'confirmed',
    type: 'send',
  } as unknown as Transaction;

  let notificationHandlers: SignatureNotificationHandler[] = [];
  let connectionRecoveryHandlers: ConnectionRecoveryHandler[] = [];

  beforeEach(() => {
    vi.spyOn(Errors, 'trackError').mockResolvedValue('tracked-error-id');
    notificationHandlers = [];
    connectionRecoveryHandlers = [];

    mockSubscriptionService = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      registerNotificationHandler: vi
        .fn()
        .mockImplementation(async (_method, _network, handler) => {
          // This will let us capture and manually call the handler
          notificationHandlers.push(handler);
        }),
      registerConnectionRecoveryHandler: vi
        .fn()
        .mockImplementation(async (_network, handler) => {
          // This will let us capture and manually call the handler
          connectionRecoveryHandlers.push(handler);
        }),
    } as unknown as SubscriptionService;

    mockAccountService = {
      findById: vi.fn().mockResolvedValue(mockAccount),
    } as unknown as AccountsService;

    mockTransactionsService = {
      fetchBySignature: vi.fn().mockResolvedValue(mockTransaction),
      save: vi.fn(),
    } as unknown as TransactionsService;

    mockAnalyticsService = {
      trackTransactionFinalized: vi.fn(),
      trackTransactionSubmitted: vi.fn(),
    } as unknown as AnalyticsService;

    mockConnection = {
      getRpc: vi.fn().mockImplementation(() => ({
        getSignatureStatuses: vi.fn().mockImplementation(() => ({
          send: vi.fn().mockReturnValue({
            value: [{ confirmationStatus: 'confirmed' }],
          }),
        })),
      })),
    } as unknown as SolanaConnection;

    signatureMonitor = new SignatureMonitor(
      mockSubscriptionService,
      mockAccountService,
      mockTransactionsService,
      mockAnalyticsService,
      mockConnection,
      mockLogger,
    );
  });

  describe('monitor', () => {
    it('subscribes to method signatureSubscribe', async () => {
      await signatureMonitor.monitor(
        signature,
        accountId,
        commitment,
        network,
        origin,
      );

      expect(mockSubscriptionService.subscribe).toHaveBeenCalledWith({
        method: 'signatureSubscribe',
        network: Network.Mainnet,
        params: [
          signature,
          {
            commitment: 'confirmed',
            enableReceivedNotification: false,
          },
        ],
        expiryMilliseconds: 600000,
        metadata: {
          accountId,
          origin,
        },
      });
    });

    it('carries a caller-supplied classification in the subscription metadata', async () => {
      await signatureMonitor.monitor(
        signature,
        accountId,
        commitment,
        network,
        origin,
        TransactionType.TokenApprove,
      );

      expect(mockSubscriptionService.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            accountId,
            origin,
            transactionType: TransactionType.TokenApprove,
          },
        }),
      );
    });

    it('registers a connection recovery handler', async () => {
      await signatureMonitor.monitor(
        signature,
        accountId,
        commitment,
        network,
        origin,
      );

      expect(
        mockSubscriptionService.registerConnectionRecoveryHandler,
      ).toHaveBeenCalledWith(network, expect.any(Function));
    });
  });

  describe('#handleSignatureNotification', () => {
    it('when the tx is processed, it saves the transaction and unsubscribes', async () => {
      const mockNotification = {} as unknown as SignatureNotification;
      const mockSubscription = {
        id: 'subscription-id-123',
        method: 'signatureSubscribe',
        network: Network.Mainnet,
        params: [
          signature,
          { commitment: 'processed', enableReceivedNotification: false },
        ],
        metadata: {
          accountId,
          origin,
        },
      } as unknown as Subscription;

      await signatureMonitor.monitor(
        signature,
        accountId,
        'processed',
        network,
        origin,
      );

      // Simulate notification received
      const handler = notificationHandlers[0]!;
      await handler(mockNotification, mockSubscription);

      expect(mockTransactionsService.save).toHaveBeenCalledWith(
        mockTransaction,
      );

      expect(
        mockAnalyticsService.trackTransactionSubmitted,
      ).not.toHaveBeenCalled();

      expect(mockSubscriptionService.unsubscribe).toHaveBeenCalledWith(
        mockSubscription.id,
      );
    });

    it('when the tx is confirmed, it saves the transaction, tracks an event in analytics, and unsubscribes', async () => {
      const mockNotification = {} as unknown as SignatureNotification;
      const mockSubscription = {
        id: 'subscription-id-123',
        method: 'signatureSubscribe',
        network: Network.Mainnet,
        params: [signature, { commitment, enableReceivedNotification: false }],
        metadata: {
          accountId,
          origin,
        },
      } as unknown as Subscription;

      await signatureMonitor.monitor(
        signature,
        accountId,
        'confirmed',
        network,
        origin,
      );

      // Simulate notification received
      const handler = notificationHandlers[0]!;
      await handler(mockNotification, mockSubscription);

      expect(mockTransactionsService.save).toHaveBeenCalledWith(
        mockTransaction,
      );

      expect(
        mockAnalyticsService.trackTransactionFinalized,
      ).toHaveBeenCalledWith({
        origin,
        accountType: mockAccount.type,
        chainIdCaip: mockTransaction.chain,
        transactionStatus: mockTransaction.status,
        transactionType: mockTransaction.type,
      });

      expect(mockSubscriptionService.unsubscribe).toHaveBeenCalledWith(
        mockSubscription.id,
      );
    });

    it('prefers the caller-supplied classification over the on-chain type on finalized', async () => {
      const mockNotification = {} as unknown as SignatureNotification;
      const mockSubscription = {
        id: 'subscription-id-123',
        method: 'signatureSubscribe',
        network: Network.Mainnet,
        params: [signature, { commitment, enableReceivedNotification: false }],
        metadata: {
          accountId,
          origin,
          transactionType: TransactionType.TokenApprove,
        },
      } as unknown as Subscription;

      await signatureMonitor.monitor(
        signature,
        accountId,
        'confirmed',
        network,
        origin,
        TransactionType.TokenApprove,
      );

      // Simulate notification received
      const handler = notificationHandlers[0]!;
      await handler(mockNotification, mockSubscription);

      expect(
        mockAnalyticsService.trackTransactionFinalized,
      ).toHaveBeenCalledWith({
        origin,
        accountType: mockAccount.type,
        chainIdCaip: mockTransaction.chain,
        transactionStatus: mockTransaction.status,
        transactionType: TransactionType.TokenApprove,
      });
    });

    it('reports the swap classification carried from submit time on finalized', async () => {
      const mockNotification = {} as unknown as SignatureNotification;
      const mockSubscription = {
        id: 'subscription-id-123',
        method: 'signatureSubscribe',
        network: Network.Mainnet,
        params: [signature, { commitment, enableReceivedNotification: false }],
        metadata: {
          accountId,
          origin,
          transactionType: TransactionType.Swap,
        },
      } as unknown as Subscription;

      await signatureMonitor.monitor(
        signature,
        accountId,
        'confirmed',
        network,
        origin,
        TransactionType.Swap,
      );

      // Simulate notification received
      const handler = notificationHandlers[0]!;
      await handler(mockNotification, mockSubscription);

      expect(
        mockAnalyticsService.trackTransactionFinalized,
      ).toHaveBeenCalledWith({
        origin,
        accountType: mockAccount.type,
        chainIdCaip: mockTransaction.chain,
        transactionStatus: mockTransaction.status,
        transactionType: TransactionType.Swap,
      });
    });

    it('tracks notification handling errors and still unsubscribes', async () => {
      const error = new Error('Save failed');
      const mockNotification = {} as unknown as SignatureNotification;
      const mockSubscription = {
        id: 'subscription-id-123',
        method: 'signatureSubscribe',
        network: Network.Mainnet,
        params: [signature, { commitment, enableReceivedNotification: false }],
        metadata: {
          accountId,
          origin,
        },
      } as unknown as Subscription;

      vi.spyOn(mockTransactionsService, 'save').mockRejectedValue(error);

      await signatureMonitor.monitor(
        signature,
        accountId,
        'confirmed',
        network,
        origin,
      );

      const handler = notificationHandlers[0]!;
      await handler(mockNotification, mockSubscription);

      expect(trackError).toHaveBeenCalledWith(error);
      expect(mockSubscriptionService.unsubscribe).toHaveBeenCalledWith(
        mockSubscription.id,
      );
    });
  });

  describe('#handleConnectionRecovery', () => {
    it('fetches, saves the transaction and tracks an event in analytics when connection was dropped and recovered, if the tx has reached the desired commitment', async () => {
      await signatureMonitor.monitor(
        signature,
        accountId,
        commitment,
        network,
        origin,
      );

      (mockTransactionsService.fetchBySignature as Mock).mockClear();
      (mockTransactionsService.save as Mock).mockClear();

      // Simulate connection recovery
      const handler = connectionRecoveryHandlers[0]!;
      await handler(network);

      expect(mockTransactionsService.fetchBySignature).toHaveBeenCalled();
      expect(mockTransactionsService.save).toHaveBeenCalled();
      expect(mockAnalyticsService.trackTransactionFinalized).toHaveBeenCalled();
    });
  });

  it('does nothing if the tx has not reached the desired commitment', async () => {
    // The transaction is only processed, not confirmed
    vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
      getSignatureStatuses: vi.fn().mockReturnValue({
        send: vi.fn().mockReturnValue({
          value: [{ confirmationStatus: 'processed' }],
        }),
      }),
    } as any);

    await signatureMonitor.monitor(
      signature,
      accountId,
      'confirmed',
      network,
      origin,
    );

    (mockTransactionsService.fetchBySignature as Mock).mockClear();
    (mockTransactionsService.save as Mock).mockClear();

    // Simulate connection recovery
    const handler = connectionRecoveryHandlers[0]!;
    await handler(network);

    expect(mockTransactionsService.fetchBySignature).not.toHaveBeenCalled();
    expect(mockTransactionsService.save).not.toHaveBeenCalled();
    expect(
      mockAnalyticsService.trackTransactionFinalized,
    ).not.toHaveBeenCalled();
  });
});
