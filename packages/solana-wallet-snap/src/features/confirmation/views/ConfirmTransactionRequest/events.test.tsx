import { SolMethod } from '@metamask/keyring-api';
import { MaliciousAcknowledgementFormNames } from '@metamask/snap-networks-utils';
import type { UserInputEvent } from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';
import type { Mock } from 'vitest';

import { Network } from '../../../../core/constants/solana';
import {
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME,
  getInterfaceContext,
  resolveInterface,
  updateInterface,
  withInterfaceLock,
} from '../../../../core/utils/interface';
import * as SnapInterface from '../../../../core/utils/interface';
import { state } from '../../../../snapContext';
import * as ConfirmTransactionRequestView from './ConfirmTransactionRequest';
import { ConfirmSignAndSendTransactionFormNames } from './events';
import { eventHandlers } from './events';
import type { ConfirmTransactionRequestContext } from './types';

const INTERFACE_ID = 'interface-id';

const baseContext: ConfirmTransactionRequestContext = {
  method: SolMethod.SignAndSendTransaction,
  scope: Network.Mainnet,
  networkImage: null,
  account: null,
  accountDomain: null,
  destinationAddress: null,
  destinationDomain: null,
  transaction: '',
  scan: null,
  scanFetchStatus: 'fetched',
  feeEstimatedInSol: '0',
  feePayment: null,
  tokenPrices: {},
  tokenPricesFetchStatus: 'fetched',
  origin: '',
  acknowledgementScreen: false,
  acknowledged: false,
  preferences: {
    locale: 'en',
    currency: 'usd',
    useSecurityAlerts: true,
    simulateOnChainActions: true,
  } as ConfirmTransactionRequestContext['preferences'],
  advanced: { shown: false, instructions: [] },
};

const maliciousScan = {
  status: 'SUCCESS' as const,
  estimatedChanges: { assets: [] },
  validation: { type: 'Malicious', reason: null },
  error: null,
  validationError: null,
};

const buttonEvent = (name: string): UserInputEvent =>
  ({
    type: UserInputEventType.ButtonClickEvent,
    name,
  }) as unknown as UserInputEvent;

const checkboxEvent = (name: string, value: boolean): UserInputEvent =>
  ({
    type: UserInputEventType.InputChangeEvent,
    name,
    value,
  }) as unknown as UserInputEvent;

/**
 * Dispatches an event while the stored interface context is `storedContext`.
 * Handlers re-read the stored context under the interface lock, so this is the
 * context they act on.
 *
 * @param name - The form element name of the event.
 * @param event - The user input event.
 * @param storedContext - The context stored for the interface.
 */
const runEvent = async (
  name: keyof typeof eventHandlers,
  event: UserInputEvent,
  storedContext: ConfirmTransactionRequestContext,
): Promise<void> => {
  (getInterfaceContext as Mock).mockResolvedValue(storedContext);
  await eventHandlers[name]?.({
    id: INTERFACE_ID,
    event,
    context: storedContext,
  } as never);
};

describe('confirm transaction request events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SnapInterface, 'getInterfaceContext').mockResolvedValue(null);
    vi.spyOn(SnapInterface, 'resolveInterface').mockResolvedValue(null);
    vi.spyOn(SnapInterface, 'updateInterface').mockResolvedValue(null);
    vi.spyOn(state, 'deleteKey').mockResolvedValue(undefined);
  });

  describe('advanced view', () => {
    it('renders the view from a serialized context so bigint instruction data can display', async () => {
      const renderView = vi
        .spyOn(ConfirmTransactionRequestView, 'ConfirmTransactionRequest')
        .mockReturnValue(null);

      await runEvent(
        ConfirmSignAndSendTransactionFormNames.ShowAdvanced,
        buttonEvent(ConfirmSignAndSendTransactionFormNames.ShowAdvanced),
        {
          ...baseContext,
          advanced: {
            shown: false,
            instructions: [
              { type: 'TokenTransfer', parsed: { data: { amount: 1000n } } },
            ] as unknown as ConfirmTransactionRequestContext['advanced']['instructions'],
          },
        },
      );

      const props = renderView.mock.calls.at(-1)?.[0] as {
        context: ConfirmTransactionRequestContext;
      };
      expect(props.context.advanced.shown).toBe(true);
      expect(props.context.advanced.instructions[0]).toMatchObject({
        parsed: { data: { amount: { __type: 'bigint', value: '1000' } } },
      });
      renderView.mockRestore();
    });
  });

  describe('malicious acknowledgement', () => {
    it('opens acknowledgement without approving when the danger Confirm is clicked', async () => {
      const name = MaliciousAcknowledgementFormNames.Review;
      await runEvent(name, buttonEvent(name), baseContext);

      expect(updateInterface).toHaveBeenCalledWith(
        INTERFACE_ID,
        expect.anything(),
        expect.objectContaining({
          acknowledgementScreen: true,
          acknowledged: false,
        }),
      );
      expect(resolveInterface).not.toHaveBeenCalled();
      expect(state.deleteKey).not.toHaveBeenCalled();
    });

    it('tracks the acknowledgement checkbox value', async () => {
      const name = MaliciousAcknowledgementFormNames.Acknowledge;
      await runEvent(name, checkboxEvent(name, true), {
        ...baseContext,
        acknowledgementScreen: true,
      });

      expect(updateInterface).toHaveBeenCalledWith(
        INTERFACE_ID,
        expect.anything(),
        expect.objectContaining({ acknowledged: true }),
      );
    });

    it('resolves the interface on proceed when the risk is acknowledged', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
      });

      expect(updateInterface).not.toHaveBeenCalled();
      expect(state.deleteKey).toHaveBeenCalledWith(
        `mapInterfaceNameToId.${CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME}`,
      );
    });

    it('does nothing on proceed when the risk is not acknowledged', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: false,
      });

      expect(updateInterface).not.toHaveBeenCalled();
      expect(state.deleteKey).not.toHaveBeenCalled();
    });

    it('allows proceeding after acknowledging a malicious request with a remote execution failure', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
        scan: {
          status: 'ERROR',
          estimatedChanges: { assets: [] },
          validation: { type: 'Malicious', reason: null },
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
          validationError: null,
        },
      });

      expect(resolveInterface).toHaveBeenCalledWith(INTERFACE_ID, true);
      expect(updateInterface).not.toHaveBeenCalled();
    });

    it('blocks proceeding when local expiry is detected during acknowledgement', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
        transactionExpired: true,
        scanFetchStatus: 'error',
      });

      expect(resolveInterface).not.toHaveBeenCalled();
      expect(updateInterface).toHaveBeenCalledWith(
        INTERFACE_ID,
        expect.anything(),
        expect.objectContaining({
          acknowledgementScreen: false,
          transactionExpired: true,
        }),
      );
    });

    it('allows proceeding after a scan outage despite a retained remote execution error', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
        scanFetchStatus: 'error',
        scan: {
          status: 'ERROR',
          estimatedChanges: { assets: [] },
          validation: { type: 'Malicious', reason: null },
          error: {
            type: 'simulation',
            code: 'ResultWithNegativeLamports',
            message: null,
          },
          validationError: null,
        },
      });

      expect(resolveInterface).toHaveBeenCalledWith(INTERFACE_ID, true);
    });

    it('returns to the confirmation view on back', async () => {
      const name = MaliciousAcknowledgementFormNames.Back;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
      });

      expect(updateInterface).toHaveBeenCalledWith(
        INTERFACE_ID,
        expect.anything(),
        expect.objectContaining({
          acknowledgementScreen: false,
          acknowledged: false,
        }),
      );
      expect(state.deleteKey).not.toHaveBeenCalled();
    });

    it('uses the latest stored context instead of the event context on proceed', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      (getInterfaceContext as Mock).mockResolvedValue({
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
      });

      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: {
          ...baseContext,
          acknowledgementScreen: true,
          acknowledged: false,
        },
      } as never);

      expect(resolveInterface).toHaveBeenCalledWith(INTERFACE_ID, true);
    });

    it('waits for an in-flight interface update before reading the context on proceed', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      let release!: () => void;
      const inFlightUpdate = withInterfaceLock(INTERFACE_ID, async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      });
      (getInterfaceContext as Mock).mockResolvedValue({
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
      });

      const proceed = eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: baseContext,
      } as never);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(getInterfaceContext).not.toHaveBeenCalled();

      release();
      await Promise.all([inFlightUpdate, proceed]);

      expect(resolveInterface).toHaveBeenCalledWith(INTERFACE_ID, true);
    });
  });

  describe('confirm', () => {
    it('resolves the interface and clears the mapping on confirm', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.Confirm;
      await runEvent(name, buttonEvent(name), baseContext);

      expect(state.deleteKey).toHaveBeenCalledWith(
        `mapInterfaceNameToId.${CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME}`,
      );
    });

    it('does not confirm when the latest context requires malicious acknowledgement', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.Confirm;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        scan: maliciousScan,
      });

      expect(resolveInterface).not.toHaveBeenCalled();
      expect(state.deleteKey).not.toHaveBeenCalled();
    });

    it('does not confirm when local expiry blocks the latest context', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.Confirm;
      await runEvent(name, buttonEvent(name), {
        ...baseContext,
        transactionExpired: true,
      });

      expect(resolveInterface).not.toHaveBeenCalled();
      expect(state.deleteKey).not.toHaveBeenCalled();
    });

    it('resolves the interface on cancel', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.Cancel;
      await runEvent(name, buttonEvent(name), baseContext);

      expect(state.deleteKey).toHaveBeenCalledWith(
        `mapInterfaceNameToId.${CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME}`,
      );
    });

    it('toggles the advanced section', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.ShowAdvanced;
      await runEvent(name, buttonEvent(name), baseContext);

      expect(updateInterface).toHaveBeenCalledWith(
        INTERFACE_ID,
        expect.anything(),
        expect.objectContaining({
          advanced: { shown: true, instructions: [] },
        }),
      );
    });
  });
});
