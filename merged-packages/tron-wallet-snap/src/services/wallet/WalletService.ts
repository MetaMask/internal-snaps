import { ILogger } from "../../utils/logger";
import { State, UnencryptedStateValue } from "../state/State";

export class WalletService {
  readonly #logger: ILogger;

  readonly #loggerPrefix = '[👛 WalletService]';

  readonly #state: State<UnencryptedStateValue>;

  constructor({ logger, state }: { logger: ILogger, state: State<UnencryptedStateValue> }) {
    this.#logger = logger;
    this.#state = state;
  }

  async signMessage(message: string): Promise<string> {
    this.#logger.log(this.#loggerPrefix, 'Signing message...', message);
    return '0x1234567890'; // TODO: Implement me
  }

  async verifyMessage(message: string, signature: string): Promise<boolean> {
    this.#logger.log(this.#loggerPrefix, 'Verifying message...', message, signature);
    return true; // TODO: Implement me
  }
}