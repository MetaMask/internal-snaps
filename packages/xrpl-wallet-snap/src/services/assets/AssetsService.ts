import type {
  KnownCaip19AssetIdOrSlip44Id,
  KnownCaip2ChainId,
} from '../../api';
import type { CoreAssetsAdapter } from './adapters/CoreAssetsAdapter';
import { parseCoreXrplAsset, parseCoreAssetMetadata } from './api';
import type { CoreAsset, CoreAssetMetadata } from './api';

/**
 * Assets service to read Assets balance and metadata from CoreAssetsAdapter.
 */
export class AssetsService {
  readonly #coreAdapter: CoreAssetsAdapter;

  constructor({ coreAdapter }: { coreAdapter: CoreAssetsAdapter }) {
    this.#coreAdapter = coreAdapter;
  }

  /**
   * Returns Core metadata for an XRPL asset.
   *
   * @param assetId - The CAIP-19 id of the asset.
   * @returns The asset metadata, or `null` when Core misses or the payload is not valid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAssetMetadata(
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<CoreAssetMetadata | null> {
    const metadata = await this.#coreAdapter.getAssetMetadata(assetId);

    return parseCoreAssetMetadata(metadata);
  }

  /**
   * Returns one account asset parsed into the Xrpl asset shape.
   *
   * @param accountId - The id of the account.
   * @param assetId - The CAIP-19 id of the asset.
   * @returns The asset, or `null` when Core misses or the row is not Xrpl.
   * @throws {InvalidCoreAssetException} When the id is XRPL but the row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssetByID(
    accountId: string,
    assetId: KnownCaip19AssetIdOrSlip44Id,
  ): Promise<CoreAsset | null> {
    const asset = await this.#coreAdapter.getAccountAssetByID(
      accountId,
      assetId,
    );

    return parseCoreXrplAsset(asset);
  }

  /**
   * Returns account assets for the given ids, in the same order.
   *
   * @param accountId - The id of the account.
   * @param assetIds - The CAIP-19 ids of the assets.
   * @returns Parsed assets. A non-Xrpl row is `null`. An empty id list is `[]`.
   * @throws {InvalidCoreAssetException} When an id is XRPL but the row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssetsByIDs(
    accountId: string,
    assetIds: KnownCaip19AssetIdOrSlip44Id[],
  ): Promise<(CoreAsset | null)[]> {
    if (assetIds.length === 0) {
      return [];
    }

    const assets = await this.#coreAdapter.getAccountAssetsByIDs(
      accountId,
      assetIds,
    );

    return assets.map((asset) => parseCoreXrplAsset(asset));
  }

  /**
   * Returns Xrpl account assets for one chain. Non-Xrpl assets are dropped.
   *
   * @param scope - The CAIP-2 chain id.
   * @param accountId - The id of the account.
   * @returns The parsed Xrpl assets.
   * @throws {InvalidCoreAssetException} When an XRPL row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssetsByScope(
    scope: KnownCaip2ChainId,
    accountId: string,
  ): Promise<CoreAsset[]> {
    const assets = await this.#coreAdapter.getAccountAssetsByScope(
      scope,
      accountId,
    );

    return assets.flatMap((asset) => {
      const parsed = parseCoreXrplAsset(asset);
      return parsed === null ? [] : [parsed];
    });
  }

  /**
   * Returns Xrpl account assets across mainnet and testnet. Non-Xrpl assets are dropped.
   *
   * @param accountId - The id of the account.
   * @returns The parsed Xrpl assets.
   * @throws {InvalidCoreAssetException} When an XRPL row is invalid.
   * @throws {CoreAssetsAdapterException} When the Core read fails.
   */
  async getAccountAssets(accountId: string): Promise<CoreAsset[]> {
    const assets = await this.#coreAdapter.getAccountAssets(accountId);

    return assets.flatMap((asset) => {
      const parsed = parseCoreXrplAsset(asset);
      return parsed === null ? [] : [parsed];
    });
  }
}
