import { TronWeb } from 'tronweb';
import type { Account } from 'tronweb/lib/esm/types';

export class TronWebClient {
  #staticInstance: TronWebClient | null = null;

  readonly #tronWeb: TronWeb;

  constructor() {
    this.#tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      headers: {
        'TRON-PRO-API-KEY': '6e4cbe0c-0bfb-4ea0-bdf8-526c0664801a',
      },
    });
  }

  public static getInstance(): TronWebClient {
    if (!TronWebClient.prototype.#staticInstance) {
      TronWebClient.prototype.#staticInstance = new TronWebClient();
    }
    return TronWebClient.prototype.#staticInstance;
  }

  public async getAccount(address: string): Promise<Account> {
    return this.#tronWeb.trx.getAccount(address);
  }

  public get tronWeb(): TronWeb {
    return this.#tronWeb;
  }
}
