import type { Messenger } from '@metamask/messenger';

import type { AssetsServiceAllowedActions } from '../services/assets/messenger';
import type { MessengerCaller } from './messenger-caller';

export type { AssetsServiceAllowedActions };

/**
 * Namespace for the root Snap Core messenger endowment.
 */
export const CORE_MESSENGER_NAMESPACE = 'SnapCore' as const;

/**
 * Actions available on the Snap Core messenger endowment.
 *
 * Aggregates allowed actions from shared services. Today this is only
 * {@link AssetsServiceAllowedActions}; more service action unions can be
 * added here as additional services are introduced.
 */
export type CoreMessengerActions = AssetsServiceAllowedActions;

/**
 * Typed messenger for Core controller actions available to a Snap via
 * `endowment:messenger` / `getMessenger`.
 */
export type CoreMessenger = Messenger<
  typeof CORE_MESSENGER_NAMESPACE,
  CoreMessengerActions
>;

/**
 * Caller for the Snap Core messenger endowment.
 *
 * Equivalent to {@link AssetsServiceMessengerCaller} while assets lookups are
 * the only delegated actions.
 */
export type CoreMessengerCaller = MessengerCaller<CoreMessengerActions>;
