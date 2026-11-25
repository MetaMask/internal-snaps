import { UserInputEventType } from '@metamask/snaps-sdk';

import {
  ConfirmationInterfaceKey,
  FetchStatus,
} from '../../../ui/confirmation/api';
import type { ConfirmationUXController } from '../../../ui/confirmation/controller';
import { MaliciousAcknowledgementFormNames } from '../../../ui/confirmation/views/MaliciousAcknowledgement/constants';
import { createEventHandlers } from '../../../ui/confirmation/views/MaliciousAcknowledgement/events';
import * as ConfirmationRender from '../../../ui/confirmation/views/render';
import { Duration } from '../../../utils';
import { logger } from '../../../utils/logger';
import {
  getInterfaceContextIfExists,
  scheduleBackgroundEvent,
  cancelBackgroundEventIfExists,
} from '../../../utils/snap';
import * as SnapUtils from '../../../utils/snap';
import { BackgroundEventMethod } from '../api';
import {
  confirmationContextRequestParams,
  createConfirmationDataContext,
} from './__fixtures__/context.fixtures';
import type {
  ConfirmationContextRefreshResult,
  IConfirmationContextRefresher,
} from './api';
import { ConfirmationContextRefresherKey } from './api';
import { RefreshConfirmationContextHandler } from './handler';

describe('RefreshConfirmationContextHandler', () => {
  const baseContext = createConfirmationDataContext();

  beforeEach(() => {
    vi.spyOn(SnapUtils, 'scheduleBackgroundEvent').mockResolvedValue(
      'scheduled',
    );
    vi.spyOn(SnapUtils, 'cancelBackgroundEvent').mockResolvedValue(undefined);
    vi.spyOn(SnapUtils, 'cancelBackgroundEventIfExists').mockResolvedValue(
      undefined,
    );
    vi.spyOn(SnapUtils, 'getInterfaceContextIfExists');
    vi.mocked(scheduleBackgroundEvent).mockClear();
    vi.mocked(scheduleBackgroundEvent).mockResolvedValue('scheduled');
    vi.mocked(cancelBackgroundEventIfExists).mockClear();
    vi.mocked(getInterfaceContextIfExists).mockReset();
  });

  function createMockRefresher(
    key: ConfirmationContextRefresherKey,
    overrides: Partial<IConfirmationContextRefresher> = {},
  ): IConfirmationContextRefresher {
    return {
      key,
      shouldFetch: vi.fn().mockReturnValue(true),
      recoveryResult: vi.fn().mockReturnValue(null),
      refresh: vi.fn().mockResolvedValue(null),
      isValidContext: vi.fn().mockReturnValue(true),
      ...overrides,
    };
  }

  function setup(refreshers: readonly IConfirmationContextRefresher[]) {
    const updateConfirmation = vi.fn().mockResolvedValue(undefined);
    const confirmationUIController = {
      updateConfirmation,
    } as unknown as ConfirmationUXController;

    const handler = new RefreshConfirmationContextHandler({
      logger,
      confirmationUIController,
      refreshers,
    });

    return { handler, updateConfirmation };
  }

  it('preserves a refreshed blocker when the acknowledgement checkbox update overlaps it', async () => {
    let context = {
      ...baseContext,
      interfaceKey: ConfirmationInterfaceKey.SignTransaction,
      locale: 'en',
      acknowledgementScreen: true,
      acknowledged: false,
    };
    let releaseRefresh!: () => void;
    let refreshStarted!: () => void;
    let releaseCheckbox!: () => void;
    let checkboxStarted!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const refreshReady = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const checkboxGate = new Promise<void>((resolve) => {
      releaseCheckbox = resolve;
    });
    const checkboxReady = new Promise<void>((resolve) => {
      checkboxStarted = resolve;
    });
    vi.mocked(getInterfaceContextIfExists).mockImplementation(
      async () => context,
    );
    vi.spyOn(ConfirmationRender, 'renderConfirmationView').mockReturnValue(
      'RENDERED' as never,
    );
    vi.spyOn(SnapUtils, 'updateInterfaceIfExists').mockImplementation(
      async (_id, _ui, next) => {
        checkboxStarted();
        await checkboxGate;
        context = next as typeof context;
        return true;
      },
    );
    const resolve = vi
      .spyOn(SnapUtils, 'resolveInterface')
      .mockResolvedValue(null);
    const refresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        refresh: vi.fn(async () => {
          refreshStarted();
          await refreshGate;
          return {
            result: { transactionsFetchStatus: FetchStatus.Error },
            reschedule: false,
          };
        }),
      },
    );
    const { handler, updateConfirmation } = setup([refresher]);
    updateConfirmation.mockImplementation(async ({ updatedContext }) => {
      context = updatedContext;
    });
    const handlers = createEventHandlers();
    const refresh = handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
    });
    await refreshReady;
    const checkboxName = MaliciousAcknowledgementFormNames.Acknowledge;
    const checkbox = handlers[checkboxName]?.({
      id: confirmationContextRequestParams.interfaceId,
      event: {
        type: UserInputEventType.InputChangeEvent,
        name: checkboxName,
        value: true,
      },
      context,
    });
    await checkboxReady;
    releaseRefresh();
    releaseCheckbox();
    await Promise.all([checkbox, refresh]);
    expect(context).toMatchObject({
      acknowledged: true,
      transactionsFetchStatus: FetchStatus.Error,
    });
    const proceedName = MaliciousAcknowledgementFormNames.Proceed;
    await handlers[proceedName]?.({
      id: confirmationContextRequestParams.interfaceId,
      event: { type: UserInputEventType.ButtonClickEvent, name: proceedName },
      context,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('schedules refresh confirmation context background event', async () => {
    const eventId =
      await RefreshConfirmationContextHandler.scheduleBackgroundEvent(
        confirmationContextRequestParams,
        Duration.FiveSeconds,
      );

    expect(eventId).toBe('scheduled');
    expect(scheduleBackgroundEvent).toHaveBeenCalledWith({
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
      duration: Duration.FiveSeconds,
    });
    expect(cancelBackgroundEventIfExists).not.toHaveBeenCalled();
  });

  it('cancels a prior event id when replaceEventId is provided', async () => {
    await RefreshConfirmationContextHandler.scheduleBackgroundEvent(
      confirmationContextRequestParams,
      Duration.OneSecond,
      { replaceEventId: 'previous-event' },
    );

    expect(cancelBackgroundEventIfExists).toHaveBeenCalledWith(
      'previous-event',
    );
    expect(scheduleBackgroundEvent).toHaveBeenCalled();
  });

  it('returns early when the interface no longer exists', async () => {
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(null);

    const refresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
    );
    const { handler, updateConfirmation } = setup([refresher]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
    });

    expect(refresher.refresh).not.toHaveBeenCalled();
    expect(updateConfirmation).not.toHaveBeenCalled();
    expect(scheduleBackgroundEvent).not.toHaveBeenCalled();
  });

  it('skips refresh when a refresher rejects the context shape', async () => {
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(baseContext);

    const refresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        isValidContext: vi.fn().mockReturnValue(false),
      },
    );
    const { handler, updateConfirmation } = setup([refresher]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
    });

    expect(refresher.refresh).not.toHaveBeenCalled();
    expect(updateConfirmation).not.toHaveBeenCalled();
  });

  it('returns early when every refresher is idle', async () => {
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(baseContext);

    const refresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        refresh: vi.fn().mockResolvedValue(null),
      },
    );
    const { handler, updateConfirmation } = setup([refresher]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
    });

    expect(refresher.shouldFetch).toHaveBeenCalledWith(baseContext);
    expect(refresher.refresh).toHaveBeenCalledWith(baseContext);
    expect(refresher.recoveryResult).not.toHaveBeenCalled();
    expect(updateConfirmation).not.toHaveBeenCalled();
    expect(scheduleBackgroundEvent).not.toHaveBeenCalled();
  });

  it('uses recoveryResult without calling refresh when shouldFetch is false', async () => {
    vi.mocked(getInterfaceContextIfExists)
      .mockResolvedValueOnce(baseContext)
      .mockResolvedValueOnce(baseContext);

    const recoveryPatch: ConfirmationContextRefreshResult = {
      result: { tokenPricesFetchStatus: FetchStatus.Fetched },
      reschedule: false,
    };

    const pricesRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        shouldFetch: vi.fn().mockReturnValue(false),
        recoveryResult: vi.fn().mockReturnValue(recoveryPatch),
      },
    );
    const scanRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Scan,
      {
        shouldFetch: vi.fn().mockReturnValue(true),
        refresh: vi.fn().mockResolvedValue(null),
      },
    );

    const { handler, updateConfirmation } = setup([
      pricesRefresher,
      scanRefresher,
    ]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: {
        ...confirmationContextRequestParams,
        refresherKeys: [
          ConfirmationContextRefresherKey.Prices,
          ConfirmationContextRefresherKey.Scan,
        ],
      },
    });

    expect(pricesRefresher.recoveryResult).toHaveBeenCalledWith(baseContext);
    expect(pricesRefresher.refresh).not.toHaveBeenCalled();
    expect(scanRefresher.shouldFetch).toHaveBeenCalledWith(baseContext);
    expect(scanRefresher.refresh).toHaveBeenCalledWith(baseContext);
    expect(scanRefresher.recoveryResult).not.toHaveBeenCalled();
    expect(updateConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedContext: expect.objectContaining({
          tokenPricesFetchStatus: FetchStatus.Fetched,
        }),
      }),
    );
    expect(scheduleBackgroundEvent).not.toHaveBeenCalled();
  });

  it('merges refresher patches, re-renders, and reschedules when requested', async () => {
    const latestContext = createConfirmationDataContext({
      tokenPricesFetchStatus: FetchStatus.Fetching,
    });
    vi.mocked(getInterfaceContextIfExists)
      .mockResolvedValueOnce(baseContext)
      .mockResolvedValueOnce(latestContext);

    const patch: ConfirmationContextRefreshResult = {
      result: {
        tokenPricesFetchStatus: FetchStatus.Fetched,
        extraField: 'patched',
      },
      reschedule: true,
    };

    const refresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        refresh: vi.fn().mockResolvedValue(patch),
      },
    );
    const { handler, updateConfirmation } = setup([refresher]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
    });

    expect(updateConfirmation).toHaveBeenCalledWith({
      interfaceId: confirmationContextRequestParams.interfaceId,
      interfaceKey: ConfirmationInterfaceKey.SignTransaction,
      updatedContext: {
        ...latestContext,
        tokenPricesFetchStatus: FetchStatus.Fetched,
        extraField: 'patched',
        backgroundEventId: 'scheduled',
      },
    });
    expect(scheduleBackgroundEvent).toHaveBeenCalledWith({
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
      duration: Duration.TwentySeconds,
    });
  });

  it('re-renders without rescheduling when no refresher requests it', async () => {
    vi.mocked(getInterfaceContextIfExists)
      .mockResolvedValueOnce(baseContext)
      .mockResolvedValueOnce(baseContext);

    const refresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { tokenPricesFetchStatus: FetchStatus.Error },
          reschedule: false,
        }),
      },
    );
    const { handler, updateConfirmation } = setup([refresher]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: confirmationContextRequestParams,
    });

    expect(updateConfirmation).toHaveBeenCalledTimes(1);
    expect(scheduleBackgroundEvent).not.toHaveBeenCalled();
  });

  it('applies patches from fulfilled refreshers when another rejects unexpectedly', async () => {
    vi.mocked(getInterfaceContextIfExists)
      .mockResolvedValueOnce(baseContext)
      .mockResolvedValueOnce(baseContext);

    const successful = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { tokenPricesFetchStatus: FetchStatus.Fetched },
          reschedule: false,
        }),
      },
    );
    const failing = createMockRefresher(ConfirmationContextRefresherKey.Scan, {
      refresh: vi.fn().mockRejectedValue(new Error('unexpected')),
    });

    const { handler, updateConfirmation } = setup([successful, failing]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: {
        ...confirmationContextRequestParams,
        refresherKeys: [
          ConfirmationContextRefresherKey.Prices,
          ConfirmationContextRefresherKey.Scan,
        ],
      },
    });

    expect(updateConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedContext: expect.objectContaining({
          tokenPricesFetchStatus: FetchStatus.Fetched,
        }),
      }),
    );
  });

  it('runs the transaction refresher first and feeds its patch to the remaining refreshers', async () => {
    vi.mocked(getInterfaceContextIfExists)
      .mockResolvedValueOnce(baseContext)
      .mockResolvedValueOnce(baseContext);

    const transactionRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Transaction,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { securityScanRequest: { transaction: 'FRESH_XDR' } },
          reschedule: true,
        }),
      },
    );
    const scanRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Scan,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { scanFetchStatus: FetchStatus.Fetched },
          reschedule: true,
        }),
      },
    );

    // Register scan first to prove ordering is driven by key, not array order.
    const { handler, updateConfirmation } = setup([
      scanRefresher,
      transactionRefresher,
    ]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: {
        ...confirmationContextRequestParams,
        refresherKeys: [
          ConfirmationContextRefresherKey.Scan,
          ConfirmationContextRefresherKey.Transaction,
        ],
      },
    });

    // The transaction refresher sees the original context...
    expect(transactionRefresher.refresh).toHaveBeenCalledTimes(1);
    expect(transactionRefresher.refresh).toHaveBeenCalledWith(baseContext);
    // ...and the scan refresher sees it already patched with the rebuilt envelope.
    expect(scanRefresher.refresh).toHaveBeenCalledTimes(1);
    expect(scanRefresher.refresh).toHaveBeenCalledWith(
      expect.objectContaining({
        securityScanRequest: { transaction: 'FRESH_XDR' },
      }),
    );
    expect(updateConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedContext: expect.objectContaining({
          securityScanRequest: { transaction: 'FRESH_XDR' },
          scanFetchStatus: FetchStatus.Fetched,
        }),
      }),
    );
  });

  it('does not run a refresher when its key is omitted from refresherKeys', async () => {
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(baseContext);

    const pricesRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { tokenPricesFetchStatus: FetchStatus.Fetched },
          reschedule: false,
        }),
      },
    );
    const scanRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Scan,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { scanFetchStatus: FetchStatus.Fetched },
          reschedule: false,
        }),
        isValidContext: vi.fn().mockReturnValue(false),
      },
    );

    const { handler, updateConfirmation } = setup([
      pricesRefresher,
      scanRefresher,
    ]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: {
        ...confirmationContextRequestParams,
        refresherKeys: [ConfirmationContextRefresherKey.Prices],
      },
    });

    expect(pricesRefresher.refresh).toHaveBeenCalled();
    expect(scanRefresher.refresh).not.toHaveBeenCalled();
    expect(scanRefresher.isValidContext).not.toHaveBeenCalled();
    expect(updateConfirmation).toHaveBeenCalled();
  });

  it('skips the security scan and does not reschedule when a refresher pauses', async () => {
    vi.mocked(getInterfaceContextIfExists)
      .mockResolvedValueOnce(baseContext)
      .mockResolvedValueOnce(baseContext);

    const transactionRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Transaction,
      {
        refresh: vi.fn().mockResolvedValue({
          result: {
            transactionsFetchStatus: FetchStatus.Error,
            scanFetchStatus: FetchStatus.Error,
          },
          reschedule: false,
          pause: true,
        }),
      },
    );
    const pricesRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Prices,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { tokenPricesFetchStatus: FetchStatus.Fetched },
          reschedule: true,
        }),
      },
    );
    const scanRefresher = createMockRefresher(
      ConfirmationContextRefresherKey.Scan,
      {
        refresh: vi.fn().mockResolvedValue({
          result: { scanFetchStatus: FetchStatus.Fetched },
          reschedule: true,
        }),
      },
    );

    const { handler, updateConfirmation } = setup([
      transactionRefresher,
      pricesRefresher,
      scanRefresher,
    ]);

    await handler.handle({
      jsonrpc: '2.0',
      id: '1',
      method: BackgroundEventMethod.RefreshConfirmationContext,
      params: {
        ...confirmationContextRequestParams,
        refresherKeys: [
          ConfirmationContextRefresherKey.Transaction,
          ConfirmationContextRefresherKey.Prices,
          ConfirmationContextRefresherKey.Scan,
        ],
      },
    });

    expect(transactionRefresher.refresh).toHaveBeenCalledTimes(1);
    expect(pricesRefresher.refresh).toHaveBeenCalledTimes(1);
    expect(scanRefresher.refresh).not.toHaveBeenCalled();
    expect(scanRefresher.isValidContext).toHaveBeenCalled();
    expect(updateConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedContext: expect.objectContaining({
          transactionsFetchStatus: FetchStatus.Error,
          scanFetchStatus: FetchStatus.Error,
          tokenPricesFetchStatus: FetchStatus.Fetched,
        }),
      }),
    );
    expect(scheduleBackgroundEvent).not.toHaveBeenCalled();
  });

  describe('ownership abort (Save during in-flight tick)', () => {
    it('skips write and reschedule when backgroundEventId changed mid-tick', async () => {
      const startedContext = createConfirmationDataContext({
        backgroundEventId: 'tick-event-in-flight',
      });
      const afterSaveContext = createConfirmationDataContext({
        backgroundEventId: 'save-replacement-event',
        memo: 'exchange-ref',
        memoScreen: false,
      });
      vi.mocked(getInterfaceContextIfExists)
        .mockResolvedValueOnce(startedContext)
        .mockResolvedValueOnce(afterSaveContext);

      const refresher = createMockRefresher(
        ConfirmationContextRefresherKey.Prices,
        {
          refresh: vi.fn().mockResolvedValue({
            result: { tokenPricesFetchStatus: FetchStatus.Fetched },
            reschedule: true,
          }),
        },
      );
      const { handler, updateConfirmation } = setup([refresher]);

      await handler.handle({
        jsonrpc: '2.0',
        id: '1',
        method: BackgroundEventMethod.RefreshConfirmationContext,
        params: confirmationContextRequestParams,
      });

      expect(refresher.refresh).toHaveBeenCalledTimes(1);
      expect(updateConfirmation).not.toHaveBeenCalled();
      expect(scheduleBackgroundEvent).not.toHaveBeenCalled();
    });

    it('writes and reschedules when backgroundEventId is unchanged', async () => {
      const context = createConfirmationDataContext({
        backgroundEventId: 'same-chain-event',
      });
      vi.mocked(getInterfaceContextIfExists)
        .mockResolvedValueOnce(context)
        .mockResolvedValueOnce(context);

      const refresher = createMockRefresher(
        ConfirmationContextRefresherKey.Prices,
        {
          refresh: vi.fn().mockResolvedValue({
            result: { tokenPricesFetchStatus: FetchStatus.Fetched },
            reschedule: true,
          }),
        },
      );
      const { handler, updateConfirmation } = setup([refresher]);

      await handler.handle({
        jsonrpc: '2.0',
        id: '1',
        method: BackgroundEventMethod.RefreshConfirmationContext,
        params: confirmationContextRequestParams,
      });

      expect(updateConfirmation).toHaveBeenCalledTimes(1);
      expect(scheduleBackgroundEvent).toHaveBeenCalledTimes(1);
      expect(updateConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedContext: expect.objectContaining({
            backgroundEventId: 'scheduled',
            tokenPricesFetchStatus: FetchStatus.Fetched,
          }),
        }),
      );
    });
  });
});
