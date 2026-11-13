import { MaliciousAcknowledgementFormNames as Ack } from '@metamask/snap-networks-utils';
import type { ComponentOrElement, UserInputEvent } from '@metamask/snaps-sdk';
import { assertJSXElement } from '@metamask/snaps-sdk/jsx';
import type { Mock } from 'vitest';

import { SnapClient } from '../../clients/snap/SnapClient';
import { TRANSACTION_TAPOS_EXPIRED } from '../../services/transaction-scan/isTransactionDeadlinePassedError';
import { SimulationStatus } from '../../services/transaction-scan/types';
import type { TransactionScanResult } from '../../services/transaction-scan/types';
import { FetchStatus } from '../../types/snap';
import { ConfirmSignTransaction } from '../../ui/confirmation/views/ConfirmSignTransaction/ConfirmSignTransaction';
import { ConfirmSignTransactionFormNames } from '../../ui/confirmation/views/ConfirmSignTransaction/events';
import { DEFAULT_CONTEXT } from '../../ui/confirmation/views/ConfirmSignTransaction/render';
import type { ConfirmSignTransactionContext } from '../../ui/confirmation/views/ConfirmSignTransaction/types';
import { ConfirmTransactionRequest } from '../../ui/confirmation/views/ConfirmTransactionRequest/ConfirmTransactionRequest';
import { ConfirmSignAndSendTransactionFormNames } from '../../ui/confirmation/views/ConfirmTransactionRequest/events';
import { DEFAULT_CONFIRMATION_CONTEXT } from '../../ui/confirmation/views/ConfirmTransactionRequest/render';
import type { ConfirmTransactionRequestContext } from '../../ui/confirmation/views/ConfirmTransactionRequest/types';
import { mockLogger } from '../../utils/mockLogger';
import { UserInputHandler } from './userInput';

type Context = ConfirmSignTransactionContext | ConfirmTransactionRequestContext;

type Setup = {
  client: {
    getInterfaceContext: Mock<() => Promise<Context | null>>;
    resolveInterface: Mock;
    withInterfaceLock: Mock;
    updateInterface: Mock<
      (id: string, ui: ComponentOrElement, context: Context) => Promise<void>
    >;
  };
  getContext: () => Context;
  setContext: (context: Context | null) => void;
  dispatch: (name: string, value?: boolean) => Promise<void>;
};

const scan: TransactionScanResult = {
  status: 'SUCCESS',
  simulationStatus: SimulationStatus.Completed,
  estimatedChanges: { assets: [] },
  validation: { type: 'Malicious', reason: null },
  error: null,
};

const render = (context: Context): ComponentOrElement =>
  Object.hasOwn(context, 'transaction')
    ? ConfirmSignTransaction({
        context: context as ConfirmSignTransactionContext,
      })
    : ConfirmTransactionRequest({
        context: context as ConfirmTransactionRequestContext,
      });

describe.each([
  [
    'send',
    DEFAULT_CONFIRMATION_CONTEXT,
    ConfirmSignAndSendTransactionFormNames,
  ],
  ['sign', DEFAULT_CONTEXT, ConfirmSignTransactionFormNames],
] as const)('%s malicious confirmation', (flow, defaults, names) => {
  const baseContext: Context = {
    ...defaults,
    scan,
    scanFetchStatus: FetchStatus.Fetched,
  };

  /**
   * Runs user input against the stored interface context, including UI updates.
   *
   * @param initial - The initial confirmation context.
   * @returns The event dispatcher and interface mocks.
   */
  function setup(initial: Context = baseContext): Setup {
    let context: Context | null = initial;
    const resolveInterface = vi.fn();
    const updateInterface = vi.fn(
      async (_id: string, _ui: ComponentOrElement, next: Context) => {
        context = next;
      },
    );
    const client = {
      getInterfaceContext: vi.fn(async () => context),
      resolveInterface,
      updateInterface,
      withInterfaceLock: vi.fn(
        async (_id: string, callback: () => Promise<void>) => callback(),
      ),
    };
    const handler = new UserInputHandler({
      logger: mockLogger,
      snapClient: client as unknown as SnapClient,
    });
    return {
      client,
      getContext: (): Context => context as Context,
      setContext: (next: Context | null): void => {
        context = next;
      },
      dispatch: (name: string, value?: boolean): Promise<void> =>
        handler.handle({
          id: 'confirmation-id',
          // Use a stale event context to verify decisions use the current stored state.
          context: { ...baseContext, scan: null },
          event: (value === undefined
            ? { type: 'ButtonClickEvent', name }
            : { type: 'InputChangeEvent', name, value }) as UserInputEvent,
        }),
    };
  }

  it.each([FetchStatus.Fetched, FetchStatus.Fetching])(
    'renders a destructive Confirm opening acknowledgement when the scan is %s',
    (scanFetchStatus) => {
      const ui = render({ ...baseContext, scanFetchStatus });
      assertJSXElement(ui);
      const serialized = JSON.stringify(ui);
      expect(serialized).toContain(Ack.Review);
      expect(serialized).toContain('"variant":"destructive"');
      expect(serialized).not.toContain(names.Confirm);
    },
  );

  it.each([
    { name: 'Warning', verdict: 'Warning', useSecurityAlerts: true },
    { name: 'Benign', verdict: 'Benign', useSecurityAlerts: true },
    { name: 'security alerts off', verdict: null, useSecurityAlerts: false },
    {
      name: 'a malicious verdict with security alerts off',
      verdict: 'Malicious',
      useSecurityAlerts: false,
    },
  ] as const)(
    'keeps ordinary confirmation for $name',
    async ({ verdict, useSecurityAlerts }) => {
      const context: Context = {
        ...baseContext,
        preferences: {
          ...baseContext.preferences,
          useSecurityAlerts,
        },
        scan: {
          ...scan,
          validation: {
            type: verdict,
            reason: null,
          },
        },
      };
      const serialized = JSON.stringify(render(context));
      expect(serialized).toContain(names.Confirm);
      expect(serialized).not.toContain(Ack.Review);
      const { dispatch, client } = setup(context);
      await dispatch(names.Confirm);
      expect(client.resolveInterface).toHaveBeenCalledWith(
        'confirmation-id',
        true,
      );
    },
  );

  it('requires a checked acknowledgement before proceeding and shows the target copy once', async () => {
    const { dispatch, client, getContext } = setup();
    await dispatch(Ack.Review);
    expect(getContext()).toMatchObject({
      acknowledgementScreen: true,
      acknowledged: false,
    });
    const ui = client.updateInterface.mock.calls.at(-1)?.[1];
    assertJSXElement(ui);
    const serialized = JSON.stringify(ui);
    expect(serialized.match(/High-risk request/gu)).toHaveLength(1);
    expect(serialized).toContain(
      "Security partners found high-risk signals in this request. If you continue, your funds can't be recovered.",
    );
    expect(serialized).toContain('"disabled":true');
    await dispatch(Ack.Proceed);
    expect(client.resolveInterface).not.toHaveBeenCalled();
    await dispatch(Ack.Acknowledge, true);
    expect(client.withInterfaceLock).toHaveBeenCalledWith(
      'confirmation-id',
      expect.any(Function),
    );
    expect(
      JSON.stringify(client.updateInterface.mock.calls.at(-1)?.[1]),
    ).not.toContain('"disabled":true');
    await dispatch(Ack.Acknowledge, false);
    await dispatch(Ack.Proceed);
    expect(client.resolveInterface).not.toHaveBeenCalled();
    await dispatch(Ack.Acknowledge, true);
    await dispatch(Ack.Proceed);
    expect(client.resolveInterface).toHaveBeenCalledWith(
      'confirmation-id',
      true,
    );
  });

  it('clears acknowledgement when going back and requires it again on reopening', async () => {
    const { dispatch, getContext, client } = setup();
    await dispatch(Ack.Review);
    await dispatch(Ack.Acknowledge, true);
    await dispatch(Ack.Back);
    expect(getContext()).toMatchObject({
      acknowledgementScreen: false,
      acknowledged: false,
    });
    expect(
      JSON.stringify(client.updateInterface.mock.calls.at(-1)?.[1]),
    ).toContain(Ack.Review);
    expect(
      JSON.stringify(client.updateInterface.mock.calls.at(-1)?.[1]),
    ).toContain(names.Cancel);
    await dispatch(Ack.Review);
    expect(getContext().acknowledged).toBe(false);
    expect(client.resolveInterface).not.toHaveBeenCalled();
  });

  it.each([Ack.Review, Ack.Back, Ack.Proceed])(
    'handles %s while holding the interface lock',
    async (name) => {
      const initial = {
        ...baseContext,
        acknowledgementScreen: true,
        acknowledged: true,
      };
      const { dispatch, client } = setup(initial);
      let locked = false;
      client.withInterfaceLock.mockImplementation(
        async (_id: string, callback: () => Promise<void>) => {
          locked = true;
          try {
            return await callback();
          } finally {
            locked = false;
          }
        },
      );
      client.getInterfaceContext.mockImplementation(async () => {
        expect(locked).toBe(true);
        return initial;
      });
      client.updateInterface.mockImplementation(async () => {
        expect(locked).toBe(true);
      });
      client.resolveInterface.mockImplementation(async () => {
        expect(locked).toBe(true);
      });
      await dispatch(name);
      expect(client.withInterfaceLock).toHaveBeenCalledWith(
        'confirmation-id',
        expect.any(Function),
      );
      expect(client.getInterfaceContext).toHaveBeenCalled();
      expect(
        client.resolveInterface.mock.calls.length +
          client.updateInterface.mock.calls.length,
      ).toBe(1);
    },
  );

  it('does not bypass acknowledgement through the ordinary Confirm event', async () => {
    const { dispatch, client } = setup();
    await dispatch(names.Confirm);
    await dispatch(Ack.Proceed);
    expect(client.resolveInterface).not.toHaveBeenCalled();
  });

  it.each([
    ['malicious', scan],
    [
      'expired',
      {
        ...scan,
        error: { type: TRANSACTION_TAPOS_EXPIRED, code: null, message: null },
      },
    ],
  ] as const)(
    'waits for a concurrent %s scan refresh before confirming',
    async (_result, refreshedScan) => {
      const initial: Context = {
        ...baseContext,
        preferences: { ...baseContext.preferences, useSecurityAlerts: true },
        scan: { ...scan, validation: { type: 'Benign', reason: null } },
      };
      const { dispatch, client, setContext } = setup(initial);
      const lockClient = new SnapClient();
      client.withInterfaceLock.mockImplementation(
        async (id: string, callback: () => Promise<void>) =>
          lockClient.withInterfaceLock(id, callback),
      );
      let releaseRefresh!: () => void;
      let refreshStarted!: () => void;
      const refreshGate = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      const refreshReady = new Promise<void>((resolve) => {
        refreshStarted = resolve;
      });
      const refresh = lockClient.withInterfaceLock(
        'confirmation-id',
        async () => {
          refreshStarted();
          await refreshGate;
          setContext({
            ...initial,
            scan: refreshedScan,
          });
        },
      );
      await refreshReady;
      const confirm = dispatch(names.Confirm);
      await Promise.resolve();
      releaseRefresh();
      await Promise.all([refresh, confirm]);
      expect(client.resolveInterface).not.toHaveBeenCalled();
    },
  );

  it.each([FetchStatus.Fetching, FetchStatus.Error])(
    'keeps the acknowledgement screen visible during a scan refresh with status %s',
    (scanFetchStatus) => {
      const serialized = JSON.stringify(
        render({
          ...baseContext,
          acknowledgementScreen: true,
          acknowledged: true,
          scanFetchStatus,
        }),
      );
      expect(serialized).toContain('High-risk request');
      expect(serialized).toContain(Ack.Proceed);
    },
  );

  const blockers: Partial<Context>[] = [
    { scanFetchStatus: FetchStatus.Loading },
    ...[TRANSACTION_TAPOS_EXPIRED, 'MALFORMED_TRANSACTION'].map((type) => ({
      scan: { ...scan, error: { type, code: null, message: null } },
    })),
    ...(flow === 'sign' ? [{ isInsufficientBalance: true }] : []),
  ];

  it.each(blockers)(
    'preserves the existing confirmation blocker %j',
    async (blocker) => {
      const { dispatch, client, getContext, setContext } = setup({
        ...baseContext,
        ...blocker,
      });
      expect(JSON.stringify(render(getContext()))).toContain('"disabled":true');
      await dispatch(Ack.Review);
      await dispatch(names.Confirm);
      expect(JSON.stringify(render(getContext()))).toContain('"disabled":true');
      expect(JSON.stringify(render(getContext()))).not.toContain(Ack.Proceed);
      expect(client.resolveInterface).not.toHaveBeenCalled();

      setContext(baseContext);
      await dispatch(Ack.Review);
      await dispatch(Ack.Acknowledge, true);
      setContext({ ...getContext(), ...blocker });
      await dispatch(Ack.Proceed);
      expect(client.resolveInterface).not.toHaveBeenCalled();
      expect(getContext()).toMatchObject({
        acknowledgementScreen: false,
        acknowledged: false,
      });
      expect(
        JSON.stringify(client.updateInterface.mock.calls.at(-1)?.[1]),
      ).toContain('"disabled":true');
    },
  );

  it('ignores acknowledgement events for closed or unrelated interfaces', async () => {
    const { dispatch, setContext, client } = setup();
    setContext(null);
    await dispatch(Ack.Review);
    await dispatch(Ack.Proceed);
    // A message confirmation has no transaction payload.
    client.getInterfaceContext.mockResolvedValue({
      preferences: baseContext.preferences,
    } as Context);
    await dispatch(Ack.Review);
    expect(client.resolveInterface).not.toHaveBeenCalled();
    expect(client.updateInterface).not.toHaveBeenCalled();
  });
});
