import { SolMethod } from '@metamask/keyring-api';
import { MaliciousAcknowledgementFormNames } from '@metamask/snap-networks-utils';
import type { UserInputEvent } from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';

import { Network } from '../../../../core/constants/solana';
import { updateInterface } from '../../../../core/utils/interface';
import { state } from '../../../../snapContext';
import { ConfirmSignAndSendTransactionFormNames } from './events';
import { eventHandlers } from './events';
import type { ConfirmTransactionRequestContext } from './types';

jest.mock('../../../../core/utils/interface', () => ({
  CONFIRM_SIGN_AND_SEND_TRANSACTION_INTERFACE_NAME: 'confirmation-interface',
  resolveInterface: jest.fn(),
  updateInterface: jest.fn(),
}));

jest.mock('../../../../snapContext', () => ({
  state: {
    deleteKey: jest.fn(),
  },
}));

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

describe('confirm transaction request events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('malicious acknowledgement', () => {
    it('opens the acknowledgement screen on "Review alert"', async () => {
      const name = MaliciousAcknowledgementFormNames.Review;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: baseContext,
      } as never);

      expect(updateInterface).toHaveBeenCalledWith(
        INTERFACE_ID,
        expect.anything(),
        expect.objectContaining({
          acknowledgementScreen: true,
          acknowledged: false,
        }),
      );
      expect(state.deleteKey).not.toHaveBeenCalled();
    });

    it('tracks the acknowledgement checkbox value', async () => {
      const name = MaliciousAcknowledgementFormNames.Acknowledge;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: checkboxEvent(name, true),
        context: { ...baseContext, acknowledgementScreen: true },
      } as never);

      expect(updateInterface).toHaveBeenCalledWith(
        INTERFACE_ID,
        expect.anything(),
        expect.objectContaining({ acknowledged: true }),
      );
    });

    it('resolves the interface on proceed when the risk is acknowledged', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: {
          ...baseContext,
          acknowledgementScreen: true,
          acknowledged: true,
        },
      } as never);

      expect(updateInterface).not.toHaveBeenCalled();
      expect(state.deleteKey).toHaveBeenCalledWith(
        'mapInterfaceNameToId.confirmation-interface',
      );
    });

    it('does nothing on proceed when the risk is not acknowledged', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: {
          ...baseContext,
          acknowledgementScreen: true,
          acknowledged: false,
        },
      } as never);

      expect(updateInterface).not.toHaveBeenCalled();
      expect(state.deleteKey).not.toHaveBeenCalled();
    });

    it('returns to the confirmation view when the transaction became invalid while acknowledging', async () => {
      const name = MaliciousAcknowledgementFormNames.Proceed;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: {
          ...baseContext,
          acknowledgementScreen: true,
          acknowledged: true,
          scan: {
            status: 'ERROR',
            estimatedChanges: { assets: [] },
            validation: { type: 'Malicious', reason: null },
            error: null,
          },
        },
      } as never);

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

    it('returns to the confirmation view on back', async () => {
      const name = MaliciousAcknowledgementFormNames.Back;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: {
          ...baseContext,
          acknowledgementScreen: true,
          acknowledged: true,
        },
      } as never);

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
  });

  describe('confirm', () => {
    it('resolves the interface and clears the mapping on confirm', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.Confirm;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: baseContext,
      } as never);

      expect(state.deleteKey).toHaveBeenCalledWith(
        'mapInterfaceNameToId.confirmation-interface',
      );
    });

    it('resolves the interface on cancel', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.Cancel;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: baseContext,
      } as never);

      expect(state.deleteKey).toHaveBeenCalledWith(
        'mapInterfaceNameToId.confirmation-interface',
      );
    });

    it('toggles the advanced section', async () => {
      const name = ConfirmSignAndSendTransactionFormNames.ShowAdvanced;
      await eventHandlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: baseContext,
      } as never);

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
