import type { Asset } from '@metamask/assets-controller';
import type { AssetsProvider, Logger } from '@metamask/snap-networks-utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';
import { findAssociatedTokenPda } from '@solana-program/token';
import { address as asAddress } from '@solana/kit';

import type { AssetEntity } from '../../../../entities';
import type { Network } from '../../../constants/solana';
import { SolanaCaip19Tokens } from '../../../constants/solana';
import type { AccountsService } from '../../accounts/AccountsService';
import type { ConfigProvider } from '../../config';
import type { SolanaConnection } from '../../connection';
import { mapControllerAsset } from '../utils/mapControllerAsset';

export type CoreAssetsAdapterOptions = {
  logger: Logger;
  getAccountAssetByID: AssetsProvider['getAccountAssetByID'];
  getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];
  getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];
  findAccountById: AccountsService['findById'];
  getActiveNetworks: ConfigProvider['getActiveNetworks'];
  fetchMint: SolanaConnection['fetchMint'];
};

/**
 * Reads fungible balances from AssetsController.
 *
 * Solana has no snap-owned assets (unlike Tron staking/energy/bandwidth), so
 * this adapter does not fetch, persist, or publish balances, and does not
 * monitor addresses for snap-owned changes.
 *
 * AssetsController stores SPL balances by mint, not by associated token
 * account. Transaction history looks up signatures by token-account pubkey,
 * so this adapter derives each token's ATA from the mint's token program
 * (including Token-2022).
 */
export class CoreAssetsAdapter {
  readonly #logger: Logger;

  readonly #getAccountAssetByID: AssetsProvider['getAccountAssetByID'];

  readonly #getAccountAssetsByIDs: AssetsProvider['getAccountAssetsByIDs'];

  readonly #getAccountAssetsByScope: AssetsProvider['getAccountAssetsByScope'];

  readonly #findAccountById: AccountsService['findById'];

  readonly #getActiveNetworks: ConfigProvider['getActiveNetworks'];

  readonly #fetchMint: SolanaConnection['fetchMint'];

  constructor(options: CoreAssetsAdapterOptions) {
    const {
      logger,
      getAccountAssetByID,
      getAccountAssetsByIDs,
      getAccountAssetsByScope,
      findAccountById,
      getActiveNetworks,
      fetchMint,
    } = options;

    this.#logger = logger.withPrefix('[🪙 CoreAssetsAdapter]');
    this.#getAccountAssetByID = getAccountAssetByID;
    this.#getAccountAssetsByIDs = getAccountAssetsByIDs;
    this.#getAccountAssetsByScope = getAccountAssetsByScope;
    this.#findAccountById = findAccountById;
    this.#getActiveNetworks = getActiveNetworks;
    this.#fetchMint = fetchMint;
  }

  async #resolveAccountAddress(accountId: string): Promise<string | null> {
    const account = await this.#findAccountById(accountId);
    return account?.address ?? null;
  }

  /**
   * Derives the associated token account address for an SPL mint.
   *
   * Fetches the mint so Token-2022 assets use the correct token program.
   * Returns `null` when derivation fails so callers can skip the asset
   * rather than returning a token without a pubkey.
   *
   * @param asset - Controller asset whose CAIP-19 ID contains the mint.
   * @param owner - Account address that owns the token account.
   * @returns ATA address, or `null` if derivation fails.
   */
  async #deriveAssociatedTokenAccountPubkey(
    asset: Asset,
    owner: string,
  ): Promise<string | null> {
    const { chainId, assetReference: mint } = parseCaipAssetType(asset.id);
    const network = chainId as Network;

    try {
      const mintAccount = await this.#fetchMint(mint, network);
      const [ata] = await findAssociatedTokenPda({
        mint: asAddress(mint),
        owner: asAddress(owner),
        tokenProgram: mintAccount.programAddress,
      });
      return ata;
    } catch (error) {
      this.#logger.warn('Failed to derive associated token account', {
        mint,
        network,
        owner,
        error,
      });
      return null;
    }
  }

  /**
   * Maps a controller asset, deriving an ATA pubkey for SPL tokens.
   *
   * @param accountId - Keyring account ID.
   * @param accountAddress - Solana account address (owner).
   * @param asset - Asset returned by AssetsController.
   * @returns Mapped asset, or `null` if the ATA cannot be derived.
   */
  async #mapAsset(
    accountId: string,
    accountAddress: string,
    asset: Asset,
  ): Promise<AssetEntity | null> {
    if (asset.id.endsWith(SolanaCaip19Tokens.SOL)) {
      return mapControllerAsset(accountId, accountAddress, asset);
    }

    const tokenAccountPubkey = await this.#deriveAssociatedTokenAccountPubkey(
      asset,
      accountAddress,
    );

    if (!tokenAccountPubkey) {
      return null;
    }

    return mapControllerAsset(
      accountId,
      accountAddress,
      asset,
      tokenAccountPubkey,
    );
  }

  async getAccountAssetByID(
    accountId: string,
    assetId: CaipAssetType,
  ): Promise<AssetEntity | null> {
    this.#logger.info('Getting account asset by ID', { accountId, assetId });

    const accountAddress = await this.#resolveAccountAddress(accountId);
    if (!accountAddress) {
      return null;
    }

    const asset = await this.#getAccountAssetByID(accountId, assetId);

    if (!asset) {
      return null;
    }

    return this.#mapAsset(accountId, accountAddress, asset);
  }

  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetEntity | null>> {
    this.#logger.info('Getting account assets by IDs', { accountId, assetIds });

    if (assetIds.length === 0) {
      return {} as Record<CaipAssetType, AssetEntity | null>;
    }

    const accountAddress = await this.#resolveAccountAddress(accountId);
    if (!accountAddress) {
      return Object.fromEntries(
        assetIds.map((assetId) => [assetId, null]),
      ) as Record<CaipAssetType, AssetEntity | null>;
    }

    const assets = await this.#getAccountAssetsByIDs(accountId, assetIds);

    const entries = await Promise.all(
      assetIds.map(async (assetId) => {
        const asset = assets[assetId];
        return [
          assetId,
          asset
            ? await this.#mapAsset(accountId, accountAddress, asset)
            : null,
        ] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<
      CaipAssetType,
      AssetEntity | null
    >;
  }

  async getAccountAssetsByScope(
    scope: CaipChainId,
    accountId: string,
  ): Promise<AssetEntity[]> {
    this.#logger.info('Getting account assets by scope', {
      scope,
      accountId,
    });

    const accountAddress = await this.#resolveAccountAddress(accountId);
    if (!accountAddress) {
      return [];
    }

    const controllerAssets = await this.#getAccountAssetsByScope(
      scope,
      accountId,
    );

    const mapped = await Promise.all(
      Object.values(controllerAssets).map(async (asset) => {
        if (!asset) {
          return null;
        }
        return this.#mapAsset(accountId, accountAddress, asset as Asset);
      }),
    );

    return mapped.filter((asset): asset is AssetEntity => asset !== null);
  }

  async getAccountAssets(accountId: string): Promise<AssetEntity[]> {
    const activeNetworks = await this.#getActiveNetworks();
    const assetsByScope = await Promise.all(
      activeNetworks.map(async (scope) =>
        this.getAccountAssetsByScope(scope, accountId),
      ),
    );

    return assetsByScope.flat();
  }
}
