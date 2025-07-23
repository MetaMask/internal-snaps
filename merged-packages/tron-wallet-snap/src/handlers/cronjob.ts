import type { JsonRpcRequest } from '@metamask/utils';

export class CronHandler {
  async handle({
    request: _request,
  }: {
    request: JsonRpcRequest;
  }): Promise<void> {
    /**
     * Map cronjob to the appropriate handler
     */
    // TODO: No cronjobs yet
  }
}
