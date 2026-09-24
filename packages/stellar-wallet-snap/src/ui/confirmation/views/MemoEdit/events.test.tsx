import type { UserInputEvent } from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';

import {
  ConfirmationContextRefresherKey,
  RefreshConfirmationContextHandler,
} from '../../../../handlers/cronjob/refreshConfirmationContext';
import {
  getInterfaceContextIfExists,
  updateInterfaceIfExists,
} from '../../../../utils';
import { ConfirmationInterfaceKey, FetchStatus } from '../../api';
import { renderConfirmationView } from '../render';
import { MemoEditFormNames } from './constants';
import { createEventHandlers } from './events';

jest.mock('../render', () => ({
  renderConfirmationView: jest.fn(() => 'RENDERED'),
}));

jest.mock('../../../../utils', () => ({
  ...jest.requireActual('../../../../utils'),
  getInterfaceContextIfExists: jest.fn().mockResolvedValue(null),
  updateInterfaceIfExists: jest.fn().mockResolvedValue(true),
}));

const formSubmitEvent = (memo: string): UserInputEvent => ({
  type: UserInputEventType.FormSubmitEvent,
  name: MemoEditFormNames.Form,
  value: { [MemoEditFormNames.Input]: memo },
});

const buttonEvent = (name: string): UserInputEvent => ({
  type: UserInputEventType.ButtonClickEvent,
  name,
});

const scheduleArgs = {
  scope: 'stellar:pubnet',
  interfaceId: 'interface-id',
  interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
  refresherKeys: [
    ConfirmationContextRefresherKey.Transaction,
    ConfirmationContextRefresherKey.Scan,
    ConfirmationContextRefresherKey.Prices,
  ],
};

describe('MemoEdit event handlers', () => {
  const handlers = createEventHandlers();
  let scheduleSpy: jest.SpiedFunction<
    typeof RefreshConfirmationContextHandler.scheduleBackgroundEvent
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduleSpy = jest
      .spyOn(RefreshConfirmationContextHandler, 'scheduleBackgroundEvent')
      .mockResolvedValue('new-event-id');
    jest.mocked(getInterfaceContextIfExists).mockResolvedValue(null);
    jest
      .mocked(renderConfirmationView)
      .mockReturnValue(
        'RENDERED' as unknown as ReturnType<typeof renderConfirmationView>,
      );
  });

  afterEach(() => {
    scheduleSpy.mockRestore();
  });

  describe('Open', () => {
    it('shows the memo editor without cancelling cron', async () => {
      await handlers[MemoEditFormNames.Open]?.({
        id: 'interface-id',
        event: buttonEvent(MemoEditFormNames.Open),
        context: {
          interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
          errorMessage: 'confirmation.txnError.requiresMemo',
          backgroundEventId: 'live-event',
        },
      });

      expect(getInterfaceContextIfExists).not.toHaveBeenCalled();
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memoScreen: true,
          memoError: null,
          backgroundEventId: 'live-event',
        }),
      );
    });
  });

  describe('Save', () => {
    it('always restarts Transaction+Scan+Prices using the latest event id', async () => {
      jest.mocked(getInterfaceContextIfExists).mockResolvedValue({
        interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
        scope: 'stellar:pubnet',
        transaction: 'xdr',
        accountId: 'account-id',
        transactionsFetchStatus: FetchStatus.Fetched,
        backgroundEventId: 'latest-event',
      });

      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('exchange-ref'),
        context: {
          interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
          scope: 'stellar:pubnet',
          transaction: 'xdr',
          accountId: 'account-id',
          transactionsFetchStatus: FetchStatus.Error,
          errorMessage: 'confirmation.txnError.requiresMemo',
          backgroundEventId: 'stale-click-event',
        },
      });

      expect(scheduleSpy).toHaveBeenCalledWith(
        scheduleArgs,
        expect.anything(),
        { replaceEventId: 'latest-event' },
      );
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: 'exchange-ref',
          memoScreen: false,
          errorMessage: null,
          transactionsFetchStatus: FetchStatus.Fetched,
          scanFetchStatus: FetchStatus.Fetching,
          backgroundEventId: 'new-event-id',
        }),
      );
    });

    it('restarts when clearing a memo so Confirm cannot stay enabled on stale success', async () => {
      jest.mocked(getInterfaceContextIfExists).mockResolvedValue({
        interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
        scope: 'stellar:pubnet',
        transaction: 'xdr',
        accountId: 'account-id',
        transactionsFetchStatus: FetchStatus.Fetched,
        scanFetchStatus: FetchStatus.Fetched,
        memo: 'exchange-ref',
        backgroundEventId: 'live-event',
      });

      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent(''),
        context: {
          interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
          scope: 'stellar:pubnet',
          transaction: 'xdr',
          accountId: 'account-id',
          transactionsFetchStatus: FetchStatus.Fetched,
          scanFetchStatus: FetchStatus.Fetched,
          memo: 'exchange-ref',
          backgroundEventId: 'live-event',
        },
      });

      expect(scheduleSpy).toHaveBeenCalledWith(
        scheduleArgs,
        expect.anything(),
        { replaceEventId: 'live-event' },
      );
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: '',
          memoScreen: false,
          scanFetchStatus: FetchStatus.Fetching,
          backgroundEventId: 'new-event-id',
        }),
      );
    });

    it('persists the memo without rescheduling when there is no live refresh pipeline', async () => {
      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('optional-ref'),
        context: {
          interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
          scope: 'stellar:pubnet',
        },
      });

      expect(scheduleSpy).not.toHaveBeenCalled();
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: 'optional-ref',
          memoScreen: false,
        }),
      );
    });

    it('keeps the memo and shows validation error without rescheduling', async () => {
      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('é'.repeat(15)),
        context: {
          interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
          errorMessage: 'confirmation.txnError.requiresMemo',
          transaction: 'xdr',
          accountId: 'account-id',
          transactionsFetchStatus: FetchStatus.Error,
        },
      });

      expect(scheduleSpy).not.toHaveBeenCalled();
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: 'é'.repeat(15),
          memoError: 'confirmation.memo.error.tooLong',
        }),
      );
    });
  });
});
