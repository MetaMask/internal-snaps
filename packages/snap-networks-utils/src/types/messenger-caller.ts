import type { ActionConstraint, Messenger } from '@metamask/messenger';
import type { AsyncMessenger } from '@metamask/snaps-sdk';

/**
 * Namespace-agnostic caller for a fixed set of messenger actions.
 *
 * Use this for Snap `getMessenger` endowments and service constructors so
 * `CoreMessengerCaller` and per-service callers stay compatible when they
 * expose the same actions.
 */
export type MessengerCaller<Actions extends ActionConstraint> = Pick<
  AsyncMessenger<Messenger<string, Actions>>,
  'call'
>;
