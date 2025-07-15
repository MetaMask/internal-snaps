import type { InterfaceContext, UserInputEvent } from '@metamask/snaps-sdk';

export class UserInputHandler {
  async handle({
    id,
    event,
    context,
  }: {
    id: string;
    event: UserInputEvent;
    context: InterfaceContext | null;
  }): Promise<void> {
    /**
     * Map user input to the appropriate handler
     */
    // TODO: No user input yet
  }
}
