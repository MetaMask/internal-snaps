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

const allRefresherKeys = [
  ConfirmationContextRefresherKey.Prices,
  ConfirmationContextRefresherKey.Scan,
  ConfirmationContextRefresherKey.Transaction,
];

const scheduleArgs = {
  scope: 'stellar:pubnet',
  interfaceId: 'interface-id',
  interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
  refresherKeys: allRefresherKeys,
};

const liveSendContext = {
  interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
  scope: 'stellar:pubnet',
  transaction: 'xdr',
  accountId: 'account-id',
  transactionsFetchStatus: FetchStatus.Fetched,
  enabledRefresherKeys: allRefresherKeys,
  backgroundEventId: 'live-event',
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
          memoDraft: 'stale-draft',
        },
      });

      expect(getInterfaceContextIfExists).not.toHaveBeenCalled();
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memoScreen: true,
          memoError: null,
          memoDraft: null,
          backgroundEventId: 'live-event',
        }),
      );
    });
  });

  describe('Save', () => {
    it('restarts open-time enabled refresher keys using the latest event id', async () => {
      jest.mocked(getInterfaceContextIfExists).mockResolvedValue({
        ...liveSendContext,
        backgroundEventId: 'latest-event',
      });

      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('exchange-ref'),
        context: {
          ...liveSendContext,
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
          memoDraft: null,
          memoScreen: false,
          errorMessage: null,
          transactionsFetchStatus: FetchStatus.Fetched,
          scanFetchStatus: FetchStatus.Fetching,
          backgroundEventId: 'new-event-id',
        }),
      );
    });

    it('schedules only preference-enabled keys from the open-time snapshot', async () => {
      const transactionOnly = [ConfirmationContextRefresherKey.Transaction];
      jest.mocked(getInterfaceContextIfExists).mockResolvedValue({
        ...liveSendContext,
        transactionsFetchStatus: FetchStatus.Error,
        enabledRefresherKeys: transactionOnly,
      });

      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('memo-only-tx'),
        context: {
          ...liveSendContext,
          transactionsFetchStatus: FetchStatus.Error,
        },
      });

      expect(scheduleSpy).toHaveBeenCalledWith(
        {
          ...scheduleArgs,
          refresherKeys: transactionOnly,
        },
        expect.anything(),
        { replaceEventId: 'live-event' },
      );
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: 'memo-only-tx',
          transactionsFetchStatus: FetchStatus.Fetched,
          backgroundEventId: 'new-event-id',
        }),
      );
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.not.objectContaining({
          scanFetchStatus: FetchStatus.Fetching,
        }),
      );
    });

    it('replaces the live event id during an in-flight tick so cron ownership aborts', async () => {
      // Click/open still see the in-flight tick id; Save must cancel that id and
      // persist a new one so the orphan tick observes ownership loss.
      jest.mocked(getInterfaceContextIfExists).mockResolvedValue({
        ...liveSendContext,
        scanFetchStatus: FetchStatus.Fetched,
        memoScreen: true,
        backgroundEventId: 'in-flight-tick-event',
      });

      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('during-flight'),
        context: {
          ...liveSendContext,
          scanFetchStatus: FetchStatus.Fetched,
          memoScreen: true,
          backgroundEventId: 'in-flight-tick-event',
        },
      });

      expect(scheduleSpy).toHaveBeenCalledWith(
        scheduleArgs,
        expect.anything(),
        { replaceEventId: 'in-flight-tick-event' },
      );
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: 'during-flight',
          memoScreen: false,
          backgroundEventId: 'new-event-id',
        }),
      );
    });

    it('restarts when clearing a memo so Confirm cannot stay enabled on stale success', async () => {
      jest.mocked(getInterfaceContextIfExists).mockResolvedValue({
        ...liveSendContext,
        scanFetchStatus: FetchStatus.Fetched,
        memo: 'exchange-ref',
      });

      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent(''),
        context: {
          ...liveSendContext,
          scanFetchStatus: FetchStatus.Fetched,
          memo: 'exchange-ref',
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

    it('keeps a draft and shows validation error without committing memo or rescheduling', async () => {
      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('é'.repeat(15)),
        context: {
          ...liveSendContext,
          memo: 'committed-memo',
          errorMessage: 'confirmation.txnError.requiresMemo',
          transactionsFetchStatus: FetchStatus.Error,
        },
      });

      expect(scheduleSpy).not.toHaveBeenCalled();
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: 'committed-memo',
          memoDraft: 'é'.repeat(15),
          memoError: 'confirmation.memo.error.tooLong',
        }),
      );
    });

    it('shows a save error when context cannot restart refresh', async () => {
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
          memoScreen: true,
          memoDraft: 'optional-ref',
          memoError: 'confirmation.memo.error.saveFailed',
        }),
      );
      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.not.objectContaining({
          memo: 'optional-ref',
        }),
      );
    });

    it('shows a save error when scheduling fails', async () => {
      jest
        .mocked(getInterfaceContextIfExists)
        .mockResolvedValue(liveSendContext);
      scheduleSpy.mockRejectedValueOnce(new Error('schedule failed'));

      await handlers[MemoEditFormNames.Form]?.({
        id: 'interface-id',
        event: formSubmitEvent('exchange-ref'),
        context: liveSendContext,
      });

      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memoScreen: true,
          memoDraft: 'exchange-ref',
          memoError: 'confirmation.memo.error.saveFailed',
        }),
      );
    });
  });

  describe('Back', () => {
    it('closes the editor without committing the draft memo', async () => {
      await handlers[MemoEditFormNames.Back]?.({
        id: 'interface-id',
        event: buttonEvent(MemoEditFormNames.Back),
        context: {
          interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
          memo: 'committed-memo',
          memoDraft: 'unsaved-draft',
          memoError: 'confirmation.memo.error.tooLong',
          memoScreen: true,
        },
      });

      expect(updateInterfaceIfExists).toHaveBeenCalledWith(
        'interface-id',
        'RENDERED',
        expect.objectContaining({
          memo: 'committed-memo',
          memoDraft: null,
          memoError: null,
          memoScreen: false,
        }),
      );
    });
  });
});
