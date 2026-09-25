import type { Amount, WalletTx } from '@metamask/bitcoindevkit';
import { getJsonError } from '@metamask/snaps-sdk';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount, Logger } from '../entities';
import { TrackingSnapEvent } from '../entities';
import logger from '../utils/logger';
import { SnapClientAdapter } from './SnapClientAdapter';

jest.mock('@metamask/bitcoindevkit', () => ({
  Amount: {
    from_sat: jest.fn(() => ({
      to_btc: jest.fn(() => ({
        toString: jest.fn(() => '0'),
      })),
    })),
  },
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}));

const setupTest = () => {
  const mockLogger = mock<Logger>();
  const mockRequest = jest.fn();
  const snapClient = new SnapClientAdapter(mockLogger);

  Object.defineProperty(globalThis, 'snap', {
    configurable: true,
    value: { request: mockRequest },
    writable: true,
  });

  return {
    snapClient,
    mockLogger,
    mockRequest,
    mockTrackingLogger: jest.mocked(logger),
  };
};

describe('SnapClientAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('emitTrackingEvent', () => {
    it("doesn't throw and logs when event tracking fails", async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const trackingError = new Error('event tracking failed');
      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const tx = mock<WalletTx>({
        txid: { toString: () => 'txid-123' },
      });
      mockRequest.mockRejectedValue(trackingError);

      expect(
        await snapClient.emitTrackingEvent(
          TrackingSnapEvent.TransactionReceived,
          account,
          tx,
          'metamask',
        ),
      ).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_trackEvent',
        params: {
          event: {
            event: TrackingSnapEvent.TransactionReceived,
            properties: {
              origin: 'metamask',
              message: 'Snap transaction received',
              chain_id_caip: 'bip122:000000000019d6689c085ae165831e93',
              account_type: 'bip122:p2wpkh',
              tx_id: 'txid-123',
            },
          },
        },
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track event: Transaction Received',
        trackingError,
      );
    });

    it('emits transaction_hash for MissedTransactionsDiscovered', async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const tx = mock<WalletTx>({
        txid: { toString: () => 'txid-123' },
      });
      mockRequest.mockResolvedValue(undefined);

      expect(
        await snapClient.emitTrackingEvent(
          TrackingSnapEvent.MissedTransactionsDiscovered,
          account,
          tx,
          'metamask',
        ),
      ).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_trackEvent',
        params: {
          event: {
            event: TrackingSnapEvent.MissedTransactionsDiscovered,
            properties: {
              origin: 'metamask',
              message: 'Snap discovered missed transaction',
              chain_id_caip: 'bip122:000000000019d6689c085ae165831e93',
              account_type: 'bip122:p2wpkh',
              transaction_hash: 'txid-123',
            },
          },
        },
      });

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("doesn't throw and logs when building properties fails", async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const propertyError = new Error('failed to serialize txid');
      const tx = mock<WalletTx>({
        txid: {
          toString: () => {
            throw propertyError;
          },
        },
      });

      expect(
        await snapClient.emitTrackingEvent(
          TrackingSnapEvent.TransactionReceived,
          account,
          tx,
          'metamask',
        ),
      ).toBeUndefined();

      expect(mockRequest).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track event: Transaction Received',
        propertyError,
      );
    });

    it('rejects pre-broadcast confirmation events at compile time', async () => {
      const { snapClient } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const tx = mock<WalletTx>({
        txid: { toString: () => 'txid-123' },
      });

      expect(
        await snapClient.emitTrackingEvent(
          // @ts-expect-error - Transaction Added carries no tx_id, so it must
          // not be routable through the post-broadcast payload path.
          TrackingSnapEvent.TransactionAdded,
          account,
          tx,
          'metamask',
        ),
      ).toBeUndefined();
    });
  });

  describe('trackTransactionAdded', () => {
    it('emits a Transaction Added event without a transaction id', async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      mockRequest.mockResolvedValue(undefined);

      expect(
        await snapClient.trackTransactionAdded(account, 'https://dapp.test'),
      ).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_trackEvent',
        params: {
          event: {
            event: TrackingSnapEvent.TransactionAdded,
            properties: {
              origin: 'https://dapp.test',
              message: 'Snap transaction added',
              chain_id_caip: 'bip122:000000000019d6689c085ae165831e93',
              account_type: 'bip122:p2wpkh',
            },
          },
        },
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("doesn't throw and logs when tracking fails", async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const trackingError = new Error('event tracking failed');
      mockRequest.mockRejectedValue(trackingError);

      expect(
        await snapClient.trackTransactionAdded(account, 'metamask'),
      ).toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track event: Transaction Added',
        trackingError,
      );
    });
  });

  describe('trackTransactionApproved', () => {
    it('emits a Transaction Approved event without a transaction id', async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'testnet',
        addressType: 'p2tr',
      });
      mockRequest.mockResolvedValue(undefined);

      expect(
        await snapClient.trackTransactionApproved(account, 'metamask'),
      ).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_trackEvent',
        params: {
          event: {
            event: TrackingSnapEvent.TransactionApproved,
            properties: {
              origin: 'metamask',
              message: 'Snap transaction approved',
              chain_id_caip: 'bip122:000000000933ea01ad0ee984209779ba',
              account_type: 'bip122:p2tr',
            },
          },
        },
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("doesn't throw and logs when tracking fails", async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const trackingError = new Error('event tracking failed');
      mockRequest.mockRejectedValue(trackingError);

      expect(
        await snapClient.trackTransactionApproved(account, 'metamask'),
      ).toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track event: Transaction Approved',
        trackingError,
      );
    });
  });

  describe('trackTransactionRejected', () => {
    it('emits a Transaction Rejected event without a transaction id', async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      mockRequest.mockResolvedValue(undefined);

      expect(
        await snapClient.trackTransactionRejected(account, 'metamask'),
      ).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_trackEvent',
        params: {
          event: {
            event: TrackingSnapEvent.TransactionRejected,
            properties: {
              origin: 'metamask',
              message: 'Snap transaction rejected',
              chain_id_caip: 'bip122:000000000019d6689c085ae165831e93',
              account_type: 'bip122:p2wpkh',
            },
          },
        },
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("doesn't throw and logs when tracking fails", async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const account = mock<BitcoinAccount>({
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const trackingError = new Error('event tracking failed');
      mockRequest.mockRejectedValue(trackingError);

      expect(
        await snapClient.trackTransactionRejected(account, 'metamask'),
      ).toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to track event: Transaction Rejected',
        trackingError,
      );
    });
  });

  describe('emitTrackingError', () => {
    it('sends the tracking error payload to the snap client', async () => {
      const { snapClient, mockRequest, mockTrackingLogger } = setupTest();

      const error = new Error('boom');
      mockRequest.mockResolvedValue(undefined);

      expect(await snapClient.emitTrackingError(error)).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: { error: getJsonError(error) },
      });
      expect(mockTrackingLogger.error).not.toHaveBeenCalled();
    });

    it("doesn't break execution when error tracking fails", async () => {
      const { snapClient, mockRequest, mockTrackingLogger } = setupTest();

      const error = new Error('boom');
      const trackingError = new Error('track failed');
      mockRequest.mockRejectedValue(trackingError);

      expect(await snapClient.emitTrackingError(error)).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_trackError',
        params: { error: getJsonError(error) },
      });
      expect(mockTrackingLogger.error).toHaveBeenCalledWith(
        { error: trackingError },
        'Failed to track error',
      );
    });
  });

  describe('startTrace', () => {
    it('returns false and logs when starting a trace fails', async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const traceError = new Error('trace failed');
      mockRequest.mockRejectedValue(traceError);

      expect(await snapClient.startTrace('Create Bitcoin Account')).toBe(false);

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_startTrace',
        params: {
          name: 'Create Bitcoin Account',
        },
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start trace',
        traceError,
      );
    });
  });

  describe('endTrace', () => {
    it('does not throw and logs when ending a trace fails', async () => {
      const { snapClient, mockLogger, mockRequest } = setupTest();

      const traceError = new Error('trace end failed');
      mockRequest.mockRejectedValue(traceError);

      expect(
        await snapClient.endTrace('Create Bitcoin Account'),
      ).toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith({
        method: 'snap_endTrace',
        params: {
          name: 'Create Bitcoin Account',
        },
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to end trace',
        traceError,
      );
    });
  });

  describe('emitAccountTransactionsUpdatedEvent', () => {
    const createWalletTx = (txid: string): WalletTx =>
      mock<WalletTx>({
        txid: { toString: () => txid },
        tx: { output: [] },
        chain_position: { is_confirmed: false },
      });

    /**
     * Creates an account whose transactions are treated as receives, so the
     * mapper takes the counterparty path under test.
     *
     * @returns A mocked Bitcoin account receiving funds.
     */
    const createReceiveAccount = (): BitcoinAccount => {
      const account = mock<BitcoinAccount>({
        id: 'account-1',
        network: 'bitcoin',
        addressType: 'p2wpkh',
      });
      const receivedAmount = mock<Amount>();
      jest.spyOn(receivedAmount, 'to_btc').mockReturnValue(0);
      account.sentAndReceived.mockReturnValue([receivedAmount, mock<Amount>()]);
      account.isMine.mockReturnValue(true);
      return account;
    };

    it('maps senders onto the emitted transactions', async () => {
      const { snapClient, mockRequest } = setupTest();
      mockRequest.mockResolvedValue(undefined);

      await snapClient.emitAccountTransactionsUpdatedEvent(
        createReceiveAccount(),
        [createWalletTx('txid-receive')],
        new Map([['txid-receive', ['bc1qsender']]]),
      );

      const emitted = mockRequest.mock.calls[0]?.[0] as {
        params: {
          params: {
            transactions: Record<string, { from: { address: string }[] }[]>;
          };
        };
      };
      expect(
        emitted.params.params.transactions['account-1']?.[0]?.from,
      ).toStrictEqual([
        {
          address: 'bc1qsender',
          asset: {
            amount: '0',
            fungible: true,
            unit: 'BTC',
            type: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
          },
        },
      ]);
    });

    it('emits transactions without a counterparty when no senders are given', async () => {
      const { snapClient, mockRequest } = setupTest();
      mockRequest.mockResolvedValue(undefined);

      await snapClient.emitAccountTransactionsUpdatedEvent(
        createReceiveAccount(),
        [createWalletTx('txid-receive')],
      );

      const emitted = mockRequest.mock.calls[0]?.[0] as {
        params: {
          params: {
            transactions: Record<string, { from: unknown[] }[]>;
          };
        };
      };
      expect(
        emitted.params.params.transactions['account-1']?.[0]?.from,
      ).toStrictEqual([]);
    });
  });
});
