import { logger } from '../../utils/logger';
import type { UserInputUiEventHandler } from './api';
import { UserInputHandler } from './userInput';

const mockEventHandler = jest.fn();

type MockEventsModule = {
  createEventHandlers: () => Record<string, UserInputUiEventHandler>;
};

/**
 * Builds a mocked `events` module exposing the given UI event handlers.
 *
 * @param handlers - The UI event handlers keyed by event name.
 * @returns The mocked module.
 */
function mockEventsModule(
  handlers: Record<string, UserInputUiEventHandler> = {},
): MockEventsModule {
  return { createEventHandlers: (): typeof handlers => handlers };
}

jest.mock('../../utils/logger');

jest.mock(
  '../../ui/confirmation/views/ConfirmSignMessage/events',
  (): MockEventsModule =>
    mockEventsModule({
      testEvent: async (...args): Promise<void> => mockEventHandler(...args),
    }),
);
jest.mock(
  '../../ui/confirmation/views/ConfirmSendTransaction/events',
  (): MockEventsModule => mockEventsModule(),
);
jest.mock(
  '../../ui/confirmation/views/ConfirmSignAuthEntry/events',
  (): MockEventsModule => mockEventsModule(),
);
jest.mock(
  '../../ui/confirmation/views/ConfirmSignChangeTrustOptIn/events',
  (): MockEventsModule => mockEventsModule(),
);
jest.mock(
  '../../ui/confirmation/views/ConfirmSignChangeTrustOptOut/events',
  (): MockEventsModule => mockEventsModule(),
);
jest.mock(
  '../../ui/confirmation/views/ConfirmSignTransaction/events',
  (): MockEventsModule => mockEventsModule(),
);
jest.mock(
  '../../ui/confirmation/views/MaliciousAcknowledgement/events',
  (): MockEventsModule => mockEventsModule(),
);
jest.mock(
  '../../ui/confirmation/views/MemoEdit/events',
  (): MockEventsModule => mockEventsModule(),
);

describe('UserInputHandler', () => {
  const handler = new UserInputHandler({ logger });

  beforeEach(() => {
    mockEventHandler.mockReset().mockResolvedValue(undefined);
  });

  it('routes the event to the handler matching its name', async () => {
    const params = {
      id: 'interface-id',
      event: { type: 'ButtonClickEvent', name: 'testEvent' },
      context: null,
    } as never;

    await handler.handle(params);

    expect(mockEventHandler).toHaveBeenCalledWith(params);
  });

  it('propagates errors from the event handler', async () => {
    mockEventHandler.mockRejectedValue(new Error('Event failed'));

    await expect(
      handler.handle({
        id: 'interface-id',
        event: { type: 'ButtonClickEvent', name: 'testEvent' },
        context: null,
      } as never),
    ).rejects.toThrow('Event failed');
  });

  it.each([
    ['has no name', { type: 'ButtonClickEvent' }],
    ['has no matching handler', { type: 'ButtonClickEvent', name: 'unknown' }],
  ])('ignores an event that %s', async (_case, event) => {
    await handler.handle({
      id: 'interface-id',
      event,
      context: null,
    } as never);

    expect(mockEventHandler).not.toHaveBeenCalled();
  });
});
