import type { Logger } from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import type { KnownCaip19Sep41AssetId } from '../../api';
import { KnownCaip2ChainId } from '../../api';
import { entries, isSep41Id } from '../../utils';
import { assertSameAddress } from '../account/utils';
import type {
  AssetMetadataService,
  StellarAssetMetadata,
} from '../asset-metadata';
import { AccountNotActivatedException } from '../network';
import type { NetworkService } from '../network';
import type { ActivatedAccountPair } from '../sync/api';
import { OnChainAccountSep41BalanceNotFoundException } from './exceptions';
import { OnChainAccount } from './OnChainAccount';
import type { OnChainAccountRepository } from './OnChainAccountRepository';
import { OnChainAccountSynchronizeService } from './OnChainAccountSynchronizeService';

/**
 * Stellar on-chain account operations: activation checks and loading {@link OnChainAccount}
 * via {@link NetworkService}.
 */
export class OnChainAccountService {
  readonly #networkService: NetworkService;

  readonly #onChainAccountSynchronizeService: OnChainAccountSynchronizeService;

  readonly #onChainAccountRepository: OnChainAccountRepository;

  readonly #assetMetadataService: AssetMetadataService;

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

    if (options?.resolveWithFullBalance) {
      await this.#bindSep41Balances(loaded, scope);
    }

    assertSameAddress(accountAddress, loaded.accountId);
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
    const assetMetadataByAssetId: Record<
      KnownCaip19Sep41AssetId,
      StellarAssetMetadata
    > = {};
    for (const assetMetadata of sep41Assets) {
      const { assetId } = assetMetadata;
      if (!isSep41Id(assetId)) {
        continue;
      }
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
    assetMetadata: StellarAssetMetadata;
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
    sep41Assets: StellarAssetMetadata[],
  ): Promise<void> {
    await this.#onChainAccountSynchronizeService.synchronize(
      activatedAccountPairs,
      scope,
      sep41Assets,
    );
  }
}
