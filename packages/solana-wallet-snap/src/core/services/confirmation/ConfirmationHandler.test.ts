import { SolMethod } from '@metamask/keyring-api';

import { render as renderConfirmSignIn } from '../../../features/confirmation/views/ConfirmSignIn/render';
import { render as renderConfirmSignMessage } from '../../../features/confirmation/views/ConfirmSignMessage/render';
import { render as renderConfirmTransactionRequest } from '../../../features/confirmation/views/ConfirmTransactionRequest/render';
import { ScheduleBackgroundEventMethod } from '../../handlers/onCronjob/backgroundEvents/ScheduleBackgroundEventMethod';
import type { SolanaKeyringRequest } from '../../handlers/onKeyringRequest/structs';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import {
  MOCK_SIGN_AND_SEND_TRANSACTION_REQUEST,
  MOCK_SIGN_TRANSACTION_REQUEST,
} from '../wallet/mocks';
import { ConfirmationHandler } from './ConfirmationHandler';

jest.mock(
  '../../../features/confirmation/views/ConfirmTransactionRequest/render',
  () => ({
    DEFAULT_CONFIRMATION_CONTEXT: {},
    render: jest.fn(),
  }),
);

jest.mock(
  '../../../features/confirmation/views/ConfirmSignMessage/render',
  () => ({
    render: jest.fn(),
  }),
);

jest.mock('../../../features/confirmation/views/ConfirmSignIn/render', () => ({
  render: jest.fn(),
}));

const mockRenderConfirmTransactionRequest = jest.mocked(
  renderConfirmTransactionRequest,
);
const mockRenderConfirmSignMessage = jest.mocked(renderConfirmSignMessage);
const mockRenderConfirmSignIn = jest.mocked(renderConfirmSignIn);

const mockSnapRequest = jest.fn();
(globalThis as unknown as { snap: unknown }).snap = {
  request: mockSnapRequest,
};

const MOCK_ORIGIN = 'https://metamask.io';

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
    mockSnapRequest.mock.calls.map(
      ([request]: [{ params: { request: { method: string } } }]) =>
        request.params.request.method,
    );

  beforeEach(() => {
    jest.clearAllMocks();
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
      mockRenderConfirmTransactionRequest.mockResolvedValue(true);

      const isConfirmed = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(isConfirmed).toBe(true);
      expect(mockRenderConfirmTransactionRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method }),
      );
      expect(getScheduledMethods()).toStrictEqual([
        ScheduleBackgroundEventMethod.OnTransactionAdded,
        ScheduleBackgroundEventMethod.OnTransactionApproved,
      ]);

      expect(mockSnapRequest).toHaveBeenCalledWith({
        method: 'snap_scheduleBackgroundEvent',
        params: {
          duration: 'PT1S',
          request: {
            method: ScheduleBackgroundEventMethod.OnTransactionApproved,
            params: {
              accountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
              metadata: {
                scope: MOCK_SIGN_AND_SEND_TRANSACTION_REQUEST.params.scope,
                origin: MOCK_ORIGIN,
              },
            },
          },
        },
      });
    });

    it('schedules Added then Rejected and returns false when the user cancels', async () => {
      mockRenderConfirmTransactionRequest.mockResolvedValue(false);

      const isConfirmed = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(isConfirmed).toBe(false);
      expect(getScheduledMethods()).toStrictEqual([
        ScheduleBackgroundEventMethod.OnTransactionAdded,
        ScheduleBackgroundEventMethod.OnTransactionRejected,
      ]);

      expect(mockSnapRequest).toHaveBeenCalledWith({
        method: 'snap_scheduleBackgroundEvent',
        params: {
          duration: 'PT1S',
          request: {
            method: ScheduleBackgroundEventMethod.OnTransactionRejected,
            params: {
              accountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
              metadata: {
                scope: MOCK_SIGN_AND_SEND_TRANSACTION_REQUEST.params.scope,
                origin: MOCK_ORIGIN,
              },
            },
          },
        },
      });
    });

    /**
     * Dismissing the dialog without pressing a button resolves to `undefined`
     * (and `snap_dialog` may resolve to `null`). The rejection branch must be
     * reached for any falsy result, not just a literal `false` — otherwise the
     * `Added` event is left orphaned with no terminal event.
     */
    it.each([undefined, null])(
      'schedules Rejected when the dialog resolves to %p',
      async (dialogResult) => {
        mockRenderConfirmTransactionRequest.mockResolvedValue(
          dialogResult as unknown as boolean,
        );

        const isConfirmed = await confirmationHandler.handleKeyringRequest(
          request,
          MOCK_SOLANA_KEYRING_ACCOUNT_0,
        );

        expect(isConfirmed).toBe(false);
        expect(getScheduledMethods()).toStrictEqual([
          ScheduleBackgroundEventMethod.OnTransactionAdded,
          ScheduleBackgroundEventMethod.OnTransactionRejected,
        ]);
      },
    );

    it('does not schedule Approved when the user rejects', async () => {
      mockRenderConfirmTransactionRequest.mockResolvedValue(false);

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

      const isConfirmed = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(isConfirmed).toBe(false);
      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('returns true when approved', async () => {
      mockRenderConfirmSignMessage.mockResolvedValue(true);

      const isConfirmed = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(isConfirmed).toBe(true);
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

      const isConfirmed = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(isConfirmed).toBe(false);
      expect(mockSnapRequest).not.toHaveBeenCalled();
    });

    it('returns true when approved', async () => {
      mockRenderConfirmSignIn.mockResolvedValue(true);

      const isConfirmed = await confirmationHandler.handleKeyringRequest(
        request,
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      );

      expect(isConfirmed).toBe(true);
      expect(mockSnapRequest).not.toHaveBeenCalled();
    });
  });
});
