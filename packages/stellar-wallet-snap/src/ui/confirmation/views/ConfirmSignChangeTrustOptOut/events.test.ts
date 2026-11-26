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
import {
  ConfirmSignChangeTrustOptOutFormNames,
  createEventHandlers,
} from './events';

const INTERFACE_ID = 'interface-id';

const buttonEvent = (name: string): UserInputEvent => ({
  type: UserInputEventType.ButtonClickEvent,
  name,
});

describe('ConfirmSignChangeTrustOptOut event handlers', () => {
  const handlers = createEventHandlers();

  beforeEach(() => {
    vi.spyOn(SnapUtils, 'resolveInterface').mockResolvedValue(null);
    vi.spyOn(SnapUtils, 'getInterfaceContextIfExists');
    vi.clearAllMocks();
  });

  it.each([
    ['Confirm', ConfirmSignChangeTrustOptOutFormNames.Confirm, true],
    ['Cancel', ConfirmSignChangeTrustOptOutFormNames.Cancel, false],
  ])(
    'resolves %s with the decision and the security verdict only',
    async (_label, name, confirmed) => {
      // The memo is only read by the send, so it is not passed on.
      const latestContext = buildScannedConfirmationContext({
        interfaceKey: ConfirmationInterfaceKey.ChangeTrustlineOptOut,
        memo: '  stray-memo  ',
      });
      vi.mocked(getInterfaceContextIfExists).mockResolvedValue(latestContext);

      await handlers[name]?.({
        id: INTERFACE_ID,
        event: buttonEvent(name),
        context: { scanFetchStatus: 'fetching' },
      });

      expect(resolveInterface).toHaveBeenCalledWith(INTERFACE_ID, {
        confirmed,
        securityProperties: maliciousScanSecurityProperties,
      });
    },
  );

  it('does not resolve when the interface no longer exists', async () => {
    vi.mocked(getInterfaceContextIfExists).mockResolvedValue(null);

    await handlers[ConfirmSignChangeTrustOptOutFormNames.Confirm]?.({
      id: INTERFACE_ID,
      event: buttonEvent(ConfirmSignChangeTrustOptOutFormNames.Confirm),
      context: {},
    });

    expect(resolveInterface).not.toHaveBeenCalled();
  });
});
