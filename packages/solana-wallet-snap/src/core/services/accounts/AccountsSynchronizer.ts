import { InFlightCoalescer } from '@metamask/snap-networks-utils';
import type { Logger } from '@metamask/snap-networks-utils';

import type { SolanaKeyringAccount } from '../../../entities';
import type { AssetsService } from '../assets/AssetsService';
import type { TransactionsService } from '../transactions';
import type { AccountsService } from './AccountsService';

export class AccountsSynchronizer {
  readonly #accountsService: AccountsService;

  readonly #assetsService: AssetsService;

  readonly #transactionsService: TransactionsService;

  readonly #logger: Logger;

  readonly #coalescer = new InFlightCoalescer();

  constructor(
    accountsService: AccountsService,
    assetsService: AssetsService,
    transactionsService: TransactionsService,
    logger: Logger,
  ) {
    this.#accountsService = accountsService;
    this.#assetsService = assetsService;
    this.#transactionsService = transactionsService;
    this.#logger = logger.withPrefix('[🔄 AccountsSynchronizer]');
  }

  async synchronize(accounts?: SolanaKeyringAccount[]): Promise<void> {
    const accountsToSync = accounts ?? (await this.#accountsService.getAll());
    const key = [...accountsToSync.map((a) => a.id)]
      .sort((a, b) => a.localeCompare(b))
      .join(',');

    return this.#coalescer.run(key, async () => {
      this.#logger.info('Synchronizing accounts', accountsToSync);

      const assets = (
        await Promise.allSettled(
          accountsToSync.map(async (account) =>
            this.#assetsService.fetch(account),
          ),
        )
      ).flatMap((item) => (item.status === 'fulfilled' ? item.value : []));

      await this.#assetsService.saveMany(assets);

      const transactions =
        await this.#transactionsService.fetchAssetsTransactions(assets, {
          limit: 20,
        });

      await this.#transactionsService.saveMany(transactions);
    });
  }
}
