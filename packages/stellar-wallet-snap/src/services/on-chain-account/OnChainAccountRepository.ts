import type { IStateManager } from '@metamask/snap-networks-utils';
import { cloneDeep } from 'lodash';

import type { KnownCaip2ChainId } from '../../api';
import type {
  OnChainAccountSnapshotsByKeyringId,
  OnChainAccountState,
  SyncFailingSinceByKeyringId,
  UnfundedOnChainAccountsByKeyringId,
} from './api';
import type { OnChainAccountSerializableFull } from './OnChainAccountSerializable';

export class OnChainAccountRepository {
  readonly #state: IStateManager<OnChainAccountState>;

  readonly #stateKey = 'onChainAccounts';

  readonly #unfundedStateKey = 'unfundedOnChainAccounts';

  readonly #syncFailingStateKey = 'syncFailingSince';

  constructor(state: IStateManager<OnChainAccountState>) {
    this.#state = state;
  }

  /**
   * Find the on-chain account for the given keyring account id from the State.
   *
   * @param keyringAccountId - MetaMask keyring account id (not the Stellar G-address).
   * @param scope - CAIP-2 chain id for the cached snapshot.
   * @returns The stored snapshot, or `null` when none exists for this keyring id and scope.
   */
  async findByKeyringAccountId(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
  ): Promise<OnChainAccountSerializableFull | null> {
    const snapshotsByAccountId = await this.findByKeyringAccountIds(
      [keyringAccountId],
      scope,
    );

    return snapshotsByAccountId[keyringAccountId] ?? null;
  }

  /**
   * Find the on-chain accounts for the given keyring account ids from the State.
   *
   * @param keyringAccountIds - MetaMask keyring account ids (not Stellar G-addresses).
   * @param scope - CAIP-2 chain id for the cached snapshots.
   * @returns Account id -> snapshot (or `null` when missing for the given scope).
   */
  async findByKeyringAccountIds(
    keyringAccountIds: string[],
    scope: KnownCaip2ChainId,
  ): Promise<Record<string, OnChainAccountSerializableFull | null>> {
    const byKeyring =
      (await this.#state.getKey<OnChainAccountSnapshotsByKeyringId>(
        this.#stateKey,
      )) ?? {};
    const snapshotsByAccountId: Record<
      string,
      OnChainAccountSerializableFull | null
    > = {};

    for (const keyringAccountId of keyringAccountIds) {
      snapshotsByAccountId[keyringAccountId] =
        byKeyring[keyringAccountId]?.[scope] ?? null;
    }

    return snapshotsByAccountId;
  }

  /**
   * Persists one snapshot under `onChainAccounts[keyringId][account.scope]` in a single atomic
   * `snap_manageState` update (avoids races between separate get/set paths).
   *
   * @param keyringAccountId - MetaMask keyring account id (not the Stellar G-address).
   * @param account - Serializable snapshot; `account.scope` selects the nested key.
   */
  async save(
    keyringAccountId: string,
    account: OnChainAccountSerializableFull,
  ): Promise<void> {
    await this.#state.update((state) => {
      const newState = cloneDeep(state);
      if (!newState[this.#stateKey]) {
        newState[this.#stateKey] = {};
      }
      const root = newState[this.#stateKey];
      root[keyringAccountId] ??= {};
      root[keyringAccountId][account.scope] = account;
      delete newState[this.#unfundedStateKey]?.[keyringAccountId]?.[
        account.scope
      ];
      return newState;
    });
  }

  /**
   * Writes accounts in one atomic `IStateManager.update` (full state blob).
   *
   * @param accounts - Map of keyring account id → snapshot for `accounts[id].scope`.
   */
  async saveMany(
    accounts: Record<string, OnChainAccountSerializableFull>,
  ): Promise<void> {
    if (Object.keys(accounts).length === 0) {
      return;
    }

    await this.#state.update((state) => {
      const newState = cloneDeep(state);
      if (!newState[this.#stateKey]) {
        newState[this.#stateKey] = {};
      }
      const accountsByKeyringId = newState[this.#stateKey];

      for (const [keyringAccountId, account] of Object.entries(accounts)) {
        accountsByKeyringId[keyringAccountId] ??= {};
        accountsByKeyringId[keyringAccountId][account.scope] = account;
        delete newState[this.#unfundedStateKey]?.[keyringAccountId]?.[
          account.scope
        ];
      }
      return newState;
    });
  }

  /**
   * Records that the network confirmed these accounts do not exist (unfunded) on `scope`.
   * Existing snapshots are kept: a false "not found" must never erase a known balance.
   *
   * @param keyringAccountIds - MetaMask keyring account ids.
   * @param scope - CAIP-2 chain id.
   * @param now - Confirmation time (ms since epoch).
   * @returns The ids that were not already marked as unfunded.
   */
  async markUnfunded(
    keyringAccountIds: string[],
    scope: KnownCaip2ChainId,
    now: number = Date.now(),
  ): Promise<string[]> {
    if (keyringAccountIds.length === 0) {
      return [];
    }

    const newlyMarked: string[] = [];
    await this.#state.update((state) => {
      newlyMarked.length = 0;
      const newState = cloneDeep(state);
      const unfunded: UnfundedOnChainAccountsByKeyringId =
        newState[this.#unfundedStateKey] ?? {};
      newState[this.#unfundedStateKey] = unfunded;
      for (const keyringAccountId of keyringAccountIds) {
        unfunded[keyringAccountId] ??= {};
        if (unfunded[keyringAccountId][scope] === undefined) {
          newlyMarked.push(keyringAccountId);
        }
        unfunded[keyringAccountId][scope] = now;
      }
      return newState;
    });
    return [...newlyMarked];
  }

  /**
   * @param keyringAccountId - MetaMask keyring account id.
   * @param scope - CAIP-2 chain id.
   * @returns Whether the network last confirmed the account as unfunded on `scope`.
   */
  async isConfirmedUnfunded(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
  ): Promise<boolean> {
    const unfunded =
      (await this.#state.getKey<UnfundedOnChainAccountsByKeyringId>(
        this.#unfundedStateKey,
      )) ?? {};
    return unfunded[keyringAccountId]?.[scope] !== undefined;
  }

  /**
   * Starts a failed-sync streak for the given accounts on `scope`. Accounts already in a
   * streak keep their original start, so the state is written only on the first failure.
   *
   * @param staleSinceByKeyringId - Map of keyring account id → start of the out-of-date period.
   * @param scope - CAIP-2 chain id.
   */
  async markSyncFailing(
    staleSinceByKeyringId: Record<string, number>,
    scope: KnownCaip2ChainId,
  ): Promise<void> {
    const current = await this.#getSyncFailing();
    const toMark = Object.entries(staleSinceByKeyringId).filter(
      ([keyringAccountId]) => current[keyringAccountId]?.[scope] === undefined,
    );
    if (toMark.length === 0) {
      return;
    }

    await this.#state.update((state) => {
      const newState = cloneDeep(state);
      const failing: SyncFailingSinceByKeyringId =
        newState[this.#syncFailingStateKey] ?? {};
      newState[this.#syncFailingStateKey] = failing;
      for (const [keyringAccountId, staleSince] of toMark) {
        failing[keyringAccountId] ??= {};
        failing[keyringAccountId][scope] ??= staleSince;
      }
      return newState;
    });
  }

  /**
   * Ends the failed-sync streak of the given accounts on `scope` (a sync succeeded). Writes
   * the state only when one of them was in a streak.
   *
   * @param keyringAccountIds - MetaMask keyring account ids.
   * @param scope - CAIP-2 chain id.
   */
  async clearSyncFailing(
    keyringAccountIds: string[],
    scope: KnownCaip2ChainId,
  ): Promise<void> {
    const current = await this.#getSyncFailing();
    const toClear = keyringAccountIds.filter(
      (keyringAccountId) => current[keyringAccountId]?.[scope] !== undefined,
    );
    if (toClear.length === 0) {
      return;
    }

    await this.#state.update((state) => {
      const newState = cloneDeep(state);
      const failing = newState[this.#syncFailingStateKey];
      for (const keyringAccountId of toClear) {
        delete failing?.[keyringAccountId]?.[scope];
        if (
          failing?.[keyringAccountId] !== undefined &&
          Object.keys(failing[keyringAccountId]).length === 0
        ) {
          delete failing[keyringAccountId];
        }
      }
      return newState;
    });
  }

  /**
   * @param keyringAccountId - MetaMask keyring account id.
   * @param scope - CAIP-2 chain id.
   * @returns Start of the out-of-date period of a failed-sync streak, if any.
   */
  async getSyncFailingSince(
    keyringAccountId: string,
    scope: KnownCaip2ChainId,
  ): Promise<number | undefined> {
    const since = (await this.#getSyncFailing())[keyringAccountId]?.[scope];
    return typeof since === 'number' && Number.isFinite(since)
      ? since
      : undefined;
  }

  async #getSyncFailing(): Promise<SyncFailingSinceByKeyringId> {
    return (
      (await this.#state.getKey<SyncFailingSinceByKeyringId>(
        this.#syncFailingStateKey,
      )) ?? {}
    );
  }
}
