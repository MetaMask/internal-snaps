import type { ILogger } from '../../utils/logger';
import type { State, UnencryptedStateValue } from '../state/State';

export class WalletService {
  readonly #logger: ILogger;

  readonly #loggerPrefix = '[👛 WalletService]';

  constructor({
    logger,
    state: _state,
  }: {
    logger: ILogger;
    state: State<UnencryptedStateValue>;
  }) {
    this.#logger = logger;
    // TODO: Use state when implementing wallet functionality
  }

  async signMessage(message: string): Promise<string> {
    this.#logger.log(this.#loggerPrefix, 'Signing message...', message);
    return '0x1234567890'; // TODO: Implement me
  }

  async verifyMessage(message: string, signature: string): Promise<boolean> {
    this.#logger.log(
      this.#loggerPrefix,
      'Verifying message...',
      message,
      signature,
    );
    return true; // TODO: Implement me
  }
}
