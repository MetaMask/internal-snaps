import * as SignMessageEvents from '../../ui/confirmation/views/ConfirmSignMessage/events';
import { logger } from '../../utils/logger';
import { UserInputHandler } from './userInput';

const { mockEventHandler } = vi.hoisted(() => ({
  mockEventHandler: vi.fn(),
}));

describe('UserInputHandler', () => {
  const handler = new UserInputHandler({ logger });

  beforeEach(() => {
    mockEventHandler.mockReset().mockResolvedValue(undefined);
    vi.spyOn(SignMessageEvents, 'createEventHandlers').mockReturnValue({
      testEvent: async (...args): Promise<void> => {
        await mockEventHandler(...args);
      },
    });
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
