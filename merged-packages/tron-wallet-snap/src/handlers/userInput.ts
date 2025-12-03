import type { InterfaceContext, UserInputEvent } from '@metamask/snaps-sdk';

import type { SnapClient } from '../clients/snap/SnapClient';
import { createEventHandlers as createSignMessageEvents } from '../ui/confirmation/views/ConfirmSignMessage/events';
import { createEventHandlers as createSignTransactionEvents } from '../ui/confirmation/views/ConfirmSignTransaction/events';
import { createEventHandlers as createTransactionConfirmationEvents } from '../ui/confirmation/views/ConfirmTransactionRequest/events';
import { withCatchAndThrowSnapError } from '../utils/errors';
import { createPrefixedLogger, type ILogger } from '../utils/logger';

export class UserInputHandler {
  readonly #logger: ILogger;

  readonly #snapClient: SnapClient;

  constructor({
    logger,
    snapClient,
  }: {
    logger: ILogger;
    snapClient: SnapClient;
  }) {
    this.#logger = createPrefixedLogger(logger, '[👵 LifecycleHandler]');
    this.#snapClient = snapClient;
  }

  /**
   * Handle user events requests.
   *
   * @param args - The request handler args as object.
   * @param args.id - The interface id associated with the event.
   * @param args.event - The event object.
   * @param args.context - The context object.
   * @returns A promise that resolves to a JSON object.
   * @throws If the request method is not valid for this snap.
   */
  async handle({
    id,
    event,
    context,
  }: {
    id: string;
    event: UserInputEvent;
    context: InterfaceContext | null;
  }): Promise<void> {
    this.#logger.log('[👇 onUserInput]', id, event);

    if (!event.name) {
      return;
    }

    const uiEventHandlers: Record<string, (...args: any) => Promise<void>> = {
      ...createTransactionConfirmationEvents(this.#snapClient),
      ...createSignMessageEvents(this.#snapClient),
      ...createSignTransactionEvents(this.#snapClient),
    };

    /**
     * Using the name of the event, route it to the correct handler
     */
    const handler = uiEventHandlers[event.name];

    if (!handler) {
      return;
    }

    await withCatchAndThrowSnapError(async () =>
      handler({ id, event, context }),
    );
  }
}
