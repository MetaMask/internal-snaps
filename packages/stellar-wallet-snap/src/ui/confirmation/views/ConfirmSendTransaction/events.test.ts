import type { UserInputEvent } from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';

import { ClientRequestMethod } from '../../../../handlers/clientRequest/api';
import { resolveInterface } from '../../../../utils';
import {
  ConfirmSendTransactionFormNames,
  createEventHandlers,
  parseConfirmSendDialogResult,
} from './events';

jest.mock('../../../../utils', () => ({
  ...jest.requireActual('../../../../utils'),
  resolveInterface: jest.fn(),
}));

const buttonEvent = (name: string): UserInputEvent => ({
  type: UserInputEventType.ButtonClickEvent,
  name,
});

describe('parseConfirmSendDialogResult', () => {
  it('maps legacy boolean true to confirmed', () => {
    expect(parseConfirmSendDialogResult(true)).toStrictEqual({
      confirmed: true,
    });
  });

  it('maps legacy boolean false and null to rejected', () => {
    expect(parseConfirmSendDialogResult(false)).toStrictEqual({
      confirmed: false,
    });
    expect(parseConfirmSendDialogResult(null)).toStrictEqual({
      confirmed: false,
    });
  });

  it('parses object results with trimmed memo', () => {
    expect(
      parseConfirmSendDialogResult({
        confirmed: true,
        memo: '  exchange-ref  ',
      }),
    ).toStrictEqual({
      confirmed: true,
      memo: 'exchange-ref',
    });
  });

  it('preserves explicit null memo', () => {
    expect(
      parseConfirmSendDialogResult({
        confirmed: true,
        memo: null,
      }),
    ).toStrictEqual({
      confirmed: true,
      memo: null,
    });
  });

  it('ignores blank memo strings', () => {
    expect(
      parseConfirmSendDialogResult({
        confirmed: true,
        memo: '   ',
      }),
    ).toStrictEqual({
      confirmed: true,
    });
  });
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
        request: {
          method: ClientRequestMethod.ConfirmSend,
          params: {},
        },
      },
    });

    expect(resolveInterface).toHaveBeenCalledWith('interface-id', {
      confirmed: true,
      memo: 'from-context',
    });
  });

  it('prefers context.memo over legacy request.params.memo', async () => {
    await handlers[ConfirmSendTransactionFormNames.Confirm]?.({
      id: 'interface-id',
      event: buttonEvent(ConfirmSendTransactionFormNames.Confirm),
      context: {
        memo: 'context-wins',
        request: {
          method: ClientRequestMethod.ConfirmSend,
          params: { memo: 'legacy-params' },
        },
      },
    });

    expect(resolveInterface).toHaveBeenCalledWith('interface-id', {
      confirmed: true,
      memo: 'context-wins',
    });
  });
});
