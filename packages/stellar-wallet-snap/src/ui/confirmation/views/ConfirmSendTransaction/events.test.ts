import type { UserInputEvent } from '@metamask/snaps-sdk';
import { UserInputEventType } from '@metamask/snaps-sdk';

import {
  getInterfaceContextIfExists,
  resolveInterface,
} from '../../../../utils';
import * as SnapUtils from '../../../../utils/snap';
import {
  buildScannedConfirmationContext,
  maliciousScanSecurityProperties,
} from '../../__fixtures__/confirmation.fixtures';
import { ConfirmationInterfaceKey } from '../../api';
import { ConfirmSendTransactionFormNames, createEventHandlers } from './events';

const buttonEvent = (name: string): UserInputEvent => ({
  type: UserInputEventType.ButtonClickEvent,
  name,
});

describe('ConfirmSendTransaction event handlers', () => {
  const handlers = createEventHandlers();

  beforeEach(() => {
    vi.spyOn(SnapUtils, 'resolveInterface').mockResolvedValue(null);
    vi.spyOn(SnapUtils, 'getInterfaceContextIfExists');
    vi.clearAllMocks();
  });

  it('resolves confirm with the latest memo and the security verdict', async () => {
    const latestContext = buildScannedConfirmationContext({
      interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
      memo: '  from-context  ',
    });
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(latestContext);

    await handlers[ConfirmSendTransactionFormNames.Confirm]?.({
      id: 'interface-id',
      event: buttonEvent(ConfirmSendTransactionFormNames.Confirm),
      context: { memo: 'stale-memo' },
    });

    expect(resolveInterface).toHaveBeenCalledWith('interface-id', {
      confirmed: true,
      memo: 'from-context',
      securityProperties: maliciousScanSecurityProperties,
    });
  });

  it('leaves out the memo and the verdict when the context has none', async () => {
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue({});

    await handlers[ConfirmSendTransactionFormNames.Confirm]?.({
      id: 'interface-id',
      event: buttonEvent(ConfirmSendTransactionFormNames.Confirm),
      context: {},
    });

    expect(resolveInterface).toHaveBeenCalledWith('interface-id', {
      confirmed: true,
    });
  });

  it('resolves cancel with the security verdict and no memo', async () => {
    const latestContext = buildScannedConfirmationContext({
      interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
      memo: 'memo',
    });
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(latestContext);

    await handlers[ConfirmSendTransactionFormNames.Cancel]?.({
      id: 'interface-id',
      event: buttonEvent(ConfirmSendTransactionFormNames.Cancel),
      context: {},
    });

    expect(resolveInterface).toHaveBeenCalledWith('interface-id', {
      confirmed: false,
      securityProperties: maliciousScanSecurityProperties,
    });
  });

  it('does not resolve when the interface no longer exists', async () => {
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(null);

    await handlers[ConfirmSendTransactionFormNames.Confirm]?.({
      id: 'interface-id',
      event: buttonEvent(ConfirmSendTransactionFormNames.Confirm),
      context: {},
    });

    expect(resolveInterface).not.toHaveBeenCalled();
  });
});
