import type { UserInputEvent } from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';

import { resolveInterface } from '../../../../utils';
import { ConfirmSendTransactionFormNames, createEventHandlers } from './events';

jest.mock('../../../../utils', () => ({
  ...jest.requireActual('../../../../utils'),
  resolveInterface: jest.fn(),
}));

const buttonEvent = (name: string): UserInputEvent => ({
  type: UserInputEventType.ButtonClickEvent,
  name,
});

describe('ConfirmSendTransaction event handlers', () => {
  const handlers = createEventHandlers();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves confirm with memo from context.memo', async () => {
    await handlers[ConfirmSendTransactionFormNames.Confirm]?.({
      id: 'interface-id',
      event: buttonEvent(ConfirmSendTransactionFormNames.Confirm),
      context: {
        memo: '  from-context  ',
      },
    });

    expect(resolveInterface).toHaveBeenCalledWith('interface-id', {
      confirmed: true,
      memo: 'from-context',
    });
  });

  it('resolves confirm with null memo when context.memo is missing', async () => {
    await handlers[ConfirmSendTransactionFormNames.Confirm]?.({
      id: 'interface-id',
      event: buttonEvent(ConfirmSendTransactionFormNames.Confirm),
      context: {},
    });

    expect(resolveInterface).toHaveBeenCalledWith('interface-id', {
      confirmed: true,
      memo: null,
    });
  });
});
