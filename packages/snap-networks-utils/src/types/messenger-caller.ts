import type {
  ActionConstraint,
  ExtractActionParameters,
  ExtractActionResponse,
} from '@metamask/messenger';

/**
 * Ability to call a single messenger action through an async Snap messenger.
 *
 * Prefer composing these with {@link MessengerCaller} rather than using
 * `AsyncMessenger<Messenger<'SomeNamespace', Actions>>` directly: Snap
 * `getMessenger` endowments use the Snap's own namespace and often expose a
 * superset of actions, so namespace-bound `AsyncMessenger` types force unsafe
 * casts at the call site.
 */
export type CanCall<Action extends ActionConstraint> = {
  call(
    actionType: Action['type'],
    ...params: ExtractActionParameters<Action, Action['type']>
  ): Promise<Awaited<ExtractActionResponse<Action, Action['type']>>>;
};

/**
 * Convert a union to an intersection (distributive).
 *
 * @template Union - Union to convert.
 */
type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

/**
 * Namespace-agnostic caller for a fixed set of messenger actions.
 *
 * Distributes {@link CanCall} over an action union so a Snap Core messenger
 * that exposes a superset of actions remains assignable without casts.
 *
 * @template Actions - Action constraint union the caller must support.
 */
export type MessengerCaller<Actions extends ActionConstraint> =
  UnionToIntersection<
    Actions extends ActionConstraint ? CanCall<Actions> : never
  >;
