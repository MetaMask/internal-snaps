import { KeyringEvent } from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip19Sep41AssetId } from '../../api';
import { AssetType, KnownCaip2ChainId } from '../../api';
import {
  entries,
  getSlip44AssetId,
  getSnapProvider,
  trackError,
} from '../../utils';
import { assertSameAddress } from '../account/utils';
import type {
  AssetMetadataService,
  Sep41StellarAssetMetadata,
} from '../asset-metadata';
import { AccountNotActivatedException } from '../network';
import type { NetworkService } from '../network';
import type { ActivatedAccountPair } from '../sync/api';
import { OnChainAccountSep41BalanceNotFoundException } from './exceptions';
import { getDefaultBalanceEntry } from './keyringBalance';
import { OnChainAccount } from './OnChainAccount';
import type { OnChainAccountRepository } from './OnChainAccountRepository';
import { OnChainAccountSynchronizeService } from './OnChainAccountSynchronizeService';

/**
 * How long after its last successful sync the stored balance of an account whose syncs keep
 * failing is still reported (~3 missed sync cycles); after that `getAccountBalances` fails so
 * the client shows the balance as unavailable instead of a silently frozen value.
 */
export const BALANCE_STALE_AFTER_MS = 90_000;

/**
 * Stellar on-chain account operations: activation checks and loading {@link OnChainAccount}
 * via {@link NetworkService}.
 */
export class OnChainAccountService {
  readonly #networkService: NetworkService;

  readonly #onChainAccountSynchronizeService: OnChainAccountSynchronizeService;

  readonly #onChainAccountRepository: OnChainAccountRepository;

  readonly #assetMetadataService: AssetMetadataService;

  readonly #logger: Logger;

  /**
   * Last successful sync per `${keyringAccountId}:${scope}` seen by this snap instance. Kept
   * in memory only: after a restart the streak start falls back to the persisted value or to
   * the first failure.
   */
  readonly #lastSyncSuccessAt = new Map<string, number>();

  constructor({
    networkService,
    onChainAccountRepository,
    logger,
    assetMetadataService,
  }: {
    networkService: NetworkService;
    onChainAccountRepository: OnChainAccountRepository;
    logger: Logger;
    assetMetadataService: AssetMetadataService;
  }) {
    this.#networkService = networkService;
    this.#onChainAccountSynchronizeService =
      new OnChainAccountSynchronizeService({
        networkService,
        onChainAccountRepository,
        logger,
      });
    this.#onChainAccountRepository = onChainAccountRepository;
    this.#assetMetadataService = assetMetadataService;
    this.#logger = logger;
  }

  /**
   * Returns whether the given address has a funded account on the network.
   *
   * @param params - Options object.
   * @param params.accountAddress - The Stellar account address (public key).
   * @param params.scope - The CAIP-2 chain ID.
   * @returns `true` if the account exists and is funded, `false` if missing.
   */
  async isAccountActivated(params: {
    accountAddress: string;
    scope: KnownCaip2ChainId;
  }): Promise<boolean> {
    const { accountAddress, scope } = params;
    try {
      await this.#networkService.getAccount(accountAddress, scope);
      return true;
    } catch (error: unknown) {
      if (error instanceof AccountNotActivatedException) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Loads activated on-chain state for an address on the given network and verifies the loaded
   * account id matches that address.
   *
   * @param accountAddress - Stellar address (strkey) expected to match Horizon `account_id`.
   * @param scope - CAIP-2 network to load the account from (Horizon `loadAccount`).
   * @param options - Optional extra loads.
   * @param options.resolveWithFullBalance - When true, also read SEP-41 balances for the
   * persisted catalog and bind them onto the Horizon account.
   * @returns Loaded {@link OnChainAccount} for simulation, fees, and sequence.
   * @throws {AccountNotActivatedException} When the account is not funded (from {@link NetworkService.loadOnChainAccount}).
   * @throws {DerivedAccountAddressMismatchException} When loaded id does not match `accountAddress`.
   * @throws {OnChainAccountSep41BalanceNotFoundException} When `resolveWithFullBalance` is set and
   * mainnet returns no SEP-41 map for the account.
   */
  async resolveOnChainAccount(
    accountAddress: string,
    scope: KnownCaip2ChainId,
    options?: {
      resolveWithFullBalance?: boolean;
    },
  ): Promise<OnChainAccount> {
    const loaded = await this.#networkService.loadOnChainAccount(
      accountAddress,
      scope,
    );

    assertSameAddress(accountAddress, loaded.accountId);

    if (options?.resolveWithFullBalance) {
      await this.#bindSep41Balances(loaded, scope);
    }

    return loaded;
  }

  /**
   * Reads SEP-41 balances for the persisted catalog and binds them onto `onChainAccount`.
   * Empty balances record (`null` or missing) are skipped.
   *
   * @param onChainAccount - Horizon account to attach SEP-41 entries to.
   * @param scope - CAIP-2 network.
   * @throws {OnChainAccountSep41BalanceNotFoundException} When mainnet returns no map for the account.
   */
  async #bindSep41Balances(
    onChainAccount: OnChainAccount,
    scope: KnownCaip2ChainId,
  ): Promise<void> {
    const sep41Assets =
      await this.#assetMetadataService.fetchSep41AssetsOrSyncOnce(scope);
    const sep41AssetIds: KnownCaip19Sep41AssetId[] = [];
    const assetMetadataByAssetId: Partial<
      Record<KnownCaip19Sep41AssetId, Sep41StellarAssetMetadata>
    > = {};
    for (const assetMetadata of sep41Assets) {
      if (assetMetadata.assetType !== AssetType.Sep41) {
        continue;
      }
      const { assetId } = assetMetadata;
      sep41AssetIds.push(assetId);
      assetMetadataByAssetId[assetId] = assetMetadata;
    }

    if (sep41AssetIds.length === 0) {
      return;
    }

    const balancesByAccount = await this.#networkService.getSep41AssetBalances({
      accounts: [onChainAccount.accountId],
      assetIds: sep41AssetIds,
      scope,
    });

    const sep41Balances = balancesByAccount[onChainAccount.accountId];
    // If it is testnet, we won't have any balances, so we return early.
    // If it is mainnet, we throw an error as it is unexpected.
    if (sep41Balances === undefined) {
      if (scope === KnownCaip2ChainId.Mainnet) {
        throw new OnChainAccountSep41BalanceNotFoundException(
          onChainAccount.accountId,
        );
      }
      return;
    }

    for (const [assetId, assetMetadata] of entries(assetMetadataByAssetId)) {
      this.#setSep41BalanceForAccount({
        onChainAccount,
        assetId,
        balance: sep41Balances[assetId],
        assetMetadata,
      });
    }
  }

  /**
   * Binds one fetched SEP-41 balance, including zero, onto an account.
   * Returns without binding when the balance is `null` or `undefined`.
   *
   * @param params - Account, one SEP-41 id, its balance, and its metadata.
   * @param params.onChainAccount - Horizon account that receives the entry.
   * @param params.assetId - SEP-41 asset id to bind.
   * @param params.balance - Balance in smallest units. `null` or `undefined` means the cell was not read.
   * @param params.assetMetadata - Metadata for `assetId`, including symbol and decimals.
   */
  #setSep41BalanceForAccount({
    onChainAccount,
    assetId,
    balance,
    assetMetadata,
  }: {
    onChainAccount: OnChainAccount;
    assetId: KnownCaip19Sep41AssetId;
    balance: BigNumber | null | undefined;
    assetMetadata: Sep41StellarAssetMetadata;
  }): void {
    // A cell can fail without failing the batch, for example reading a
    // trustline asset through its SEP-41 contract when the account is not
    // authorized to hold it. Skip that asset and keep the rest.
    if (balance === null || balance === undefined) {
      return;
    }

    const { decimals } = assetMetadata.units[0];
    const { symbol } = assetMetadata;

    onChainAccount.setAsset(assetId, {
      balance,
      symbol,
      decimals,
    });
  }

  /**
   * Loads the on-chain account for the given keyring account id from the State.
   *
   * @param keyringAccountId - The keyring account id to load the on-chain account for.
   * @param scope - The CAIP-2 chain id to load the on-chain account for.
   * @returns The on-chain account, or `null` if not found.
   */
  async resolveOnChainAccountByKeyringAccountId(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccount | null> {
    const onChainAccount =
      await this.#onChainAccountRepository.findByKeyringAccountId(
        keyringAccountId,
        scope,
      );
    return onChainAccount
      ? OnChainAccount.fromSerializable(onChainAccount)
      : null;
  }

  /**
   * Records keyring accounts the network confirmed as unfunded (not created on-chain) on `scope`.
   *
   * @param keyringAccountIds - MetaMask keyring account ids.
   * @param scope - CAIP-2 network.
   * @returns The ids that were not already marked as unfunded.
   */
  async markAccountsUnfunded(
    keyringAccountIds: string[],
    scope: KnownCaip2ChainId,
  ): Promise<string[]> {
    const newlyMarked = await this.#onChainAccountRepository.markUnfunded(
      keyringAccountIds,
      scope,
    );

    // The client may hold these balances as unavailable (getAccountBalances fails until the
    // account is confirmed unfunded): tell it the confirmed 0 once, best effort.
    if (newlyMarked.length > 0) {
      const nativeAssetId = getSlip44AssetId(scope);
      try {
        await emitSnapKeyringEvent(
          getSnapProvider(),
          KeyringEvent.AccountBalancesUpdated,
          {
            balances: Object.fromEntries(
              newlyMarked.map((id) => [
                id,
                { [nativeAssetId]: getDefaultBalanceEntry() },
              ]),
            ),
          },
        );
      } catch (error: unknown) {
        await trackError(error);
      }
    }

    return newlyMarked;
  }

  /**
   * Whether the network last confirmed the account as unfunded on `scope`, as opposed to an
   * account that was never synchronized (e.g. every load failed), whose balance is unknown.
   *
   * @param keyringAccountId - MetaMask keyring account id.
   * @param scope - CAIP-2 network.
   * @returns `true` if the account is confirmed unfunded.
   */
  /**
   * Records the outcome of a sync run: a success ends the failed-sync streak of the account,
   * a failure starts one (from the last success seen by this snap instance, or now). Never
   * throws: a state error must not fail the sync.
   *
   * @param outcome - Accounts whose sync succeeded or failed.
   * @param outcome.succeededIds - Keyring account ids synchronized successfully.
   * @param outcome.failedIds - Keyring account ids whose sync failed.
   * @param scope - CAIP-2 network.
   * @param now - Current time (ms).
   */
  async recordSyncOutcome(
    {
      succeededIds,
      failedIds,
    }: { succeededIds: string[]; failedIds: string[] },
    scope: KnownCaip2ChainId,
    now: number = Date.now(),
  ): Promise<void> {
    try {
      for (const id of succeededIds) {
        this.#lastSyncSuccessAt.set(`${id}:${scope}`, now);
      }
      if (succeededIds.length > 0) {
        await this.#onChainAccountRepository.clearSyncFailing(
          succeededIds,
          scope,
        );
      }
      if (failedIds.length > 0) {
        await this.#onChainAccountRepository.markSyncFailing(
          Object.fromEntries(
            failedIds.map((id) => [
              id,
              this.#lastSyncSuccessAt.get(`${id}:${scope}`) ?? now,
            ]),
          ),
          scope,
        );
      }
    } catch (error: unknown) {
      this.#logger.warn('Failed to record the sync outcome', { error });
    }
  }

  /**
   * Whether the stored balance of the account is out of date: its last successful sync is
   * older than {@link BALANCE_STALE_AFTER_MS} and the syncs since then failed. An account
   * that was simply not polled yet (no failure recorded) is not stale.
   *
   * @param keyringAccountId - MetaMask keyring account id.
   * @param scope - CAIP-2 network.
   * @param now - Current time (ms).
   * @returns Whether the balance must be reported as unavailable.
   */
  async isBalanceStale(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
    now: number = Date.now(),
  ): Promise<boolean> {
    const since = await this.#onChainAccountRepository.getSyncFailingSince(
      keyringAccountId,
      scope,
    );
    return since !== undefined && now - since >= BALANCE_STALE_AFTER_MS;
  }

  async isConfirmedUnfunded(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
  ): Promise<boolean> {
    return this.#onChainAccountRepository.isConfirmedUnfunded(
      keyringAccountId,
      scope,
    );
  }

  /**
   * Enriches accounts with SEP-41 balances, persists snapshots, then notifies the keyring when
   * balances or the tracked asset set changed. Delegates to {@link OnChainAccountSynchronizeService}.
   *
   * @param activatedAccountPairs - Activated account pairs to synchronize.
   * @param scope - CAIP-2 network.
   * @param sep41Assets - Preloaded SEP-41 assets from {@link SynchronizeService}.
   */
  async synchronize(
    activatedAccountPairs: ActivatedAccountPair[],
    scope: KnownCaip2ChainId,
    sep41Assets: Sep41StellarAssetMetadata[],
  ): Promise<void> {
    await this.#onChainAccountSynchronizeService.synchronize(
      activatedAccountPairs,
      scope,
      sep41Assets,
    );
  }
}
