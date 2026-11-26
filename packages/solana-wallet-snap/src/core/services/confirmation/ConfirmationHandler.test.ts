import { SolMethod, TransactionType } from '@metamask/keyring-api';
import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';
import type { Mock } from 'vitest';

import * as ConfirmSignInRender from '../../../features/confirmation/views/ConfirmSignIn/render';
import * as ConfirmSignMessageRender from '../../../features/confirmation/views/ConfirmSignMessage/render';
import * as ConfirmTransactionRequestRender from '../../../features/confirmation/views/ConfirmTransactionRequest/render';
import { ScheduleBackgroundEventMethod } from '../../handlers/onCronjob/backgroundEvents/ScheduleBackgroundEventMethod';
import type { SolanaKeyringRequest } from '../../handlers/onKeyringRequest/structs';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import {
  MOCK_SIGN_AND_SEND_TRANSACTION_REQUEST,
  MOCK_SIGN_TRANSACTION_REQUEST,
} from '../wallet/mocks';
import { ConfirmationHandler } from './ConfirmationHandler';

let mockRenderConfirmTransactionRequest: Mock;
let mockRenderConfirmSignMessage: Mock;
let mockRenderConfirmSignIn: Mock;

const mockSnapRequest = vi.fn();
(globalThis as unknown as { snap: unknown }).snap = {
  request: mockSnapRequest,
};

const MOCK_ORIGIN = 'https://metamask.io';

/**
 * The shape of a single `snap_scheduleBackgroundEvent` call, shared by every
 * transaction lifecycle event.
 */
type ScheduledEventCall = {
  method: string;
  params: {
    duration: string;
    request: {
      method: string;
      params: {
        accountId: string;
        metadata: {
          scope: SolanaKeyringRequest['scope'];
          origin: string;
          transactionType: TransactionType;
        };
      };
    };
  };
};

describe('ConfirmationHandler', () => {
  let confirmationHandler: ConfirmationHandler;

  const mockTransactionRequest = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    scope: MOCK_SIGN_AND_SEND_TRANSACTION_REQUEST.params.scope,
    account: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
    request: MOCK_SIGN_AND_SEND_TRANSACTION_REQUEST,
    origin: MOCK_ORIGIN,
  } as unknown as SolanaKeyringRequest;

  /**
   * The ordered list of background events scheduled by the handler. Ordering
   * matters: `Added` must always be scheduled before `Approved`/`Rejected`.
   *
   * @returns The scheduled event method names.
   */
  const getScheduledMethods = (): string[] =>
    mockSnapRequest.mock.calls.map((call) => {
      const request = call[0] as {
        params: { request: { method: string } };
      };
      return request.params.request.method;
    });

  /**
   * The full `snap_scheduleBackgroundEvent` call expected for a given lifecycle
   * event. Every event shares one payload shape, so asserting against this
   * keeps `Added` covered exactly like the terminal events.
   *
   * @param method - The lifecycle event method name.
   * @param origin - The origin carried in the event metadata.
   * @param transactionType - The classification carried in the event metadata.
   * @returns The expected `snap.request` call.
   */
  const expectedScheduleCall = (
    method: string,
    origin = MOCK_ORIGIN,
    transactionType = TransactionType.Unknown,
  ): ScheduledEventCall => ({
    method: 'snap_scheduleBackgroundEvent',
    params: {
      duration: 'PT1S',
      request: {
        method,
        params: {
          accountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
          metadata: {
            scope: mockTransactionRequest.scope,
            origin,
            transactionType,
          },
        },
      },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderConfirmTransactionRequest = vi.spyOn(
      ConfirmTransactionRequestRender,
      'render',
    ) as unknown as Mock;
    mockRenderConfirmSignMessage = vi.spyOn(
      ConfirmSignMessageRender,
      'render',
    ) as unknown as Mock;
    mockRenderConfirmSignIn = vi.spyOn(
      ConfirmSignInRender,
      'render',
    ) as unknown as Mock;
    mockSnapRequest.mockResolvedValue(undefined);
    confirmationHandler = new ConfirmationHandler();
  });

  describe('handleKeyringRequest', () => {
    it('throws for an unsupported method', async () => {
      const request = {
        ...mockTransactionRequest,
        request: { method: 'unsupportedMethod', params: {} },
      } as unknown as SolanaKeyringRequest;

      await expect(
        confirmationHandler.handleKeyringRequest(
          request,
          MOCK_SOLANA_KEYRING_ACCOUNT_0,
        ),
      ).rejects.toThrow('Unsupported method: unsupportedMethod');
    });
  });

  describe.each([
    [SolMethod.SignAndSendTransaction, MOCK_SIGN_AND_SEND_TRANSACTION_REQUEST],
    [SolMethod.SignTransaction, MOCK_SIGN_TRANSACTION_REQUEST],
  ])('transaction request (%s)', (method, walletRequest) => {
    const request = {
      ...mockTransactionRequest,
      request: walletRequest,
    } as unknown as SolanaKeyringRequest;

    it('schedules Added then Approved and returns true when the user confirms', async () => {
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: true,
        context: {},
      });

      const result = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({ confirmed: true, context: {} });
      expect(mockRenderConfirmTransactionRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method }),
      );
      expect(mockSnapRequest.mock.calls).toStrictEqual([
        [
          expectedScheduleCall(
            ScheduleBackgroundEventMethod.OnTransactionAdded,
          ),
        ],
        [
          expectedScheduleCall(
            ScheduleBackgroundEventMethod.OnTransactionApproved,
          ),
        ],
      ]);
    });

    it('schedules Added then Rejected and returns false when the user cancels', async () => {
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: false,
        context: {},
      });

      const result = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({ confirmed: false, context: {} });
      expect(mockSnapRequest.mock.calls).toStrictEqual([
        [
          expectedScheduleCall(
            ScheduleBackgroundEventMethod.OnTransactionAdded,
          ),
        ],
        [
          expectedScheduleCall(
            ScheduleBackgroundEventMethod.OnTransactionRejected,
          ),
        ],
      ]);
    });

    /**
     * A dismissed dialog is turned into a non-confirmation by the render. The
     * rejection branch must still be reached for it, otherwise the `Added`
     * event is left orphaned with no terminal event.
     */
    it('schedules Rejected when the render reports no confirmation', async () => {
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: false,
        context: {},
      });

      const result = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({ confirmed: false, context: {} });
      expect(getScheduledMethods()).toStrictEqual([
        ScheduleBackgroundEventMethod.OnTransactionAdded,
        ScheduleBackgroundEventMethod.OnTransactionRejected,
      ]);
    });

    it('returns the verdict the render reported and carries it into Approved', async () => {
      const securityProperties = {
        securityAlertResponse: 'Malicious',
        securityAlertReason: 'known_attacker',
        securityAlertDescription:
          "Security alert: A known attacker's account is involved in the transaction",
      };
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: true,
        context: { securityProperties },
      });

      const result = await confirmationHandler.handleKeyringRequest(
        { ...request, origin: DEFAULT_METAMASK_ORIGIN },
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({
        confirmed: true,
        context: { securityProperties },
      });
      const approvedCall = mockSnapRequest.mock.calls[1]?.[0] as {
        params: { request: { params: { metadata: unknown } } };
      };
      expect(approvedCall.params.request.params.metadata).toStrictEqual({
        scope: mockTransactionRequest.scope,
        origin: DEFAULT_METAMASK_ORIGIN,
        transactionType: TransactionType.Send,
        securityProperties,
      });
    });

    it('carries the verdict the render reported into Rejected', async () => {
      const securityProperties = {
        securityAlertResponse: 'Warning',
        securityAlertReason: 'honeypot',
        securityAlertDescription:
          'Security alert: The account invests funds in a token that is part of an orchestrated honeypot scheme',
      };
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: false,
        context: { securityProperties },
      });

      const result = await confirmationHandler.handleKeyringRequest(
        { ...request, origin: DEFAULT_METAMASK_ORIGIN },
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({
        confirmed: false,
        context: { securityProperties },
      });
      const rejectedCall = mockSnapRequest.mock.calls[1]?.[0] as {
        params: { request: { method: string; params: { metadata: unknown } } };
      };
      expect(rejectedCall.params.request.method).toBe(
        ScheduleBackgroundEventMethod.OnTransactionRejected,
      );
      expect(rejectedCall.params.request.params.metadata).toStrictEqual({
        scope: mockTransactionRequest.scope,
        origin: DEFAULT_METAMASK_ORIGIN,
        transactionType: TransactionType.Send,
        securityProperties,
      });
    });

    it('carries the verdict of a dApp transaction into Approved, classified as unknown', async () => {
      const securityProperties = {
        securityAlertResponse: 'Benign',
      };
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: true,
        context: { securityProperties },
      });

      await confirmationHandler.handleKeyringRequest(
        { ...request, origin: 'https://dapp.example' },
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      const approvedCall = mockSnapRequest.mock.calls[1]?.[0] as {
        params: { request: { params: { metadata: unknown } } };
      };
      expect(approvedCall.params.request.params.metadata).toStrictEqual({
        scope: mockTransactionRequest.scope,
        origin: 'https://dapp.example',
        transactionType: TransactionType.Unknown,
        securityProperties,
      });
    });

    it('reports a MetaMask-originated transaction as a send', async () => {
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: true,
        context: {},
      });

      await confirmationHandler.handleKeyringRequest(
        { ...request, origin: DEFAULT_METAMASK_ORIGIN },
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(mockSnapRequest.mock.calls).toStrictEqual([
        [
          expectedScheduleCall(
            ScheduleBackgroundEventMethod.OnTransactionAdded,
            DEFAULT_METAMASK_ORIGIN,
            TransactionType.Send,
          ),
        ],
        [
          expectedScheduleCall(
            ScheduleBackgroundEventMethod.OnTransactionApproved,
            DEFAULT_METAMASK_ORIGIN,
            TransactionType.Send,
          ),
        ],
      ]);
    });

    it('does not schedule Approved when the user rejects', async () => {
      mockRenderConfirmTransactionRequest.mockResolvedValue({
        confirmed: false,
        context: {},
      });

      await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(getScheduledMethods()).not.toContain(
        ScheduleBackgroundEventMethod.OnTransactionApproved,
      );
    });
  });

  describe('sign message request', () => {
    const request = {
      ...mockTransactionRequest,
      request: { method: SolMethod.SignMessage, params: {} },
    } as unknown as SolanaKeyringRequest;

    it('returns false and schedules no transaction events when rejected', async () => {
      mockRenderConfirmSignMessage.mockResolvedValue(false);

      const result = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({ confirmed: false });
      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('returns true when approved', async () => {
      mockRenderConfirmSignMessage.mockResolvedValue(true);

      const result = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({ confirmed: true });
      expect(mockSnapRequest).not.toHaveBeenCalled();
    });
  });

  describe('sign in request', () => {
    const request = {
      ...mockTransactionRequest,
      request: { method: SolMethod.SignIn, params: {} },
    } as unknown as SolanaKeyringRequest;

    it('returns false and schedules no transaction events when rejected', async () => {
      mockRenderConfirmSignIn.mockResolvedValue(false);

      const result = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({ confirmed: false });
      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('returns true when approved', async () => {
      mockRenderConfirmSignIn.mockResolvedValue(true);

      const result = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(result).toStrictEqual({ confirmed: true });
      expect(mockSnapRequest).not.toHaveBeenCalled();
    });
  });
});
