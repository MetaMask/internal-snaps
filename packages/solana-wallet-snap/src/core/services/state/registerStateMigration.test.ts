import type { IStateManager } from '@metamask/snap-networks-utils';

import { EventEmitter } from '../../../infrastructure/event-emitter/EventEmitter';
import { mockLogger } from '../__mocks__/logger';
import { registerStateMigration } from './registerStateMigration';
import type { UnencryptedStateValue } from './stateTypes';

describe('registerStateMigration', () => {
  it.each(['onStart', 'onUpdate', 'onInstall'])(
    'deletes the legacy assets state on %s',
    async (event) => {
      const eventEmitter = new EventEmitter(mockLogger);
      const state = {
        deleteKey: jest.fn().mockResolvedValue(undefined),
      } as Pick<IStateManager<UnencryptedStateValue>, 'deleteKey'>;

      registerStateMigration(eventEmitter, state);
      // eslint-disable-next-line n/no-sync
      await eventEmitter.emitSync(event);

      expect(state.deleteKey).toHaveBeenCalledWith('assets');
    },
  );
});
