import type { IStateManager } from '@metamask/snap-networks-utils';

import type { EventEmitter } from '../../../infrastructure';
import type { UnencryptedStateValue } from './stateTypes';

/**
 * Registers the legacy state migration on Snap lifecycle events.
 *
 * @param eventEmitter - The Snap lifecycle event emitter.
 * @param state - The Snap state manager.
 */
export const registerStateMigration = (
  eventEmitter: EventEmitter,
  state: Pick<IStateManager<UnencryptedStateValue>, 'deleteKey'>,
): void => {
  const migrateState = async (): Promise<void> => state.deleteKey('assets');

  eventEmitter.on('onStart', migrateState);
  eventEmitter.on('onUpdate', migrateState);
  eventEmitter.on('onInstall', migrateState);
};
