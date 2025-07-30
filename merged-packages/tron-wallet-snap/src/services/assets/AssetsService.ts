import {
  KeyringEvent,
  type AccountBalancesUpdatedEvent,
  type AccountAssetListUpdatedEvent,
  type KeyringAccount,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import type {
  AssetMetadata,
  FungibleAssetMetadata,
  NonFungibleAssetMetadata,
} from '@metamask/snaps-sdk';
import type { CaipAssetType } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';
import { cloneDeep } from 'lodash';
import type { Account } from 'tronweb/lib/esm/types';

import type { AssetsRepository } from './AssetsRepository';
import type {
  NativeCaipAssetType,
  NftCaipAssetType,
  TokenCaipAssetType,
} from './types';
import { Network } from '../../constants';
import type { AssetEntity } from '../../entities/assets';
import { createPrefixedLogger, type ILogger } from '../../utils/logger';
import type { Connection } from '../connection/Connection';
import type { State, UnencryptedStateValue } from '../state/State';

export class AssetsService {
  readonly #logger: ILogger;

  readonly #assetsRepository: AssetsRepository;

  readonly #connection: Connection;

  readonly #state: State<UnencryptedStateValue>;

  constructor({
    logger,
    assetsRepository,
    connection,
    state,
  }: {
    logger: ILogger;
    assetsRepository: AssetsRepository;
    connection: Connection;
    state: State<UnencryptedStateValue>;
  }) {
    this.#logger = createPrefixedLogger(logger, '[🪙 AssetsService]');
    this.#assetsRepository = assetsRepository;
    this.#connection = connection;
    this.#state = state;
  }

  async getAssetsMetadata(
    assetTypes: CaipAssetType[],
  ): Promise<Record<CaipAssetType, AssetMetadata | null>> {
    this.#logger.info('Fetching metadata for assets', assetTypes);

    const {
      nativeAssetTypes,
      tokenTrc10AssetTypes,
      tokenTrc20AssetTypes,
      nftAssetTypes,
    } = this.#splitAssetsByType(assetTypes);

    const [
      nativeTokensMetadata,
      trc10TokensMetadata,
      trc20TokensMetadata,
      nftMetadata,
    ] = await Promise.all([
      this.#getNativeTokensMetadata(nativeAssetTypes),
      this.#getTRC10TokensMetadata(tokenTrc10AssetTypes, Network.Mainnet),
      this.#getTRC20TokensMetadata(tokenTrc20AssetTypes, Network.Mainnet),
      this.#getNftsMetadata(nftAssetTypes),
    ]);

    const result = {
      ...nativeTokensMetadata,
      ...trc10TokensMetadata,
      ...trc20TokensMetadata,
      ...nftMetadata,
    };

    this.#logger.info('Resolved assets metadata', { assetTypes, result });
    console.log('Resolved assets metadata', JSON.stringify(result, null, 2));

    return result;
  }

  #splitAssetsByType(assetTypes: CaipAssetType[]): {
    nativeAssetTypes: NativeCaipAssetType[];
    tokenTrc10AssetTypes: TokenCaipAssetType[];
    tokenTrc20AssetTypes: TokenCaipAssetType[];
    nftAssetTypes: NftCaipAssetType[];
  } {
    const nativeAssetTypes = assetTypes.filter((assetType) =>
      assetType.endsWith('slip44:195'),
    ) as NativeCaipAssetType[];
    const tokenTrc10AssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc10:'),
    ) as TokenCaipAssetType[];
    const tokenTrc20AssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc20:'),
    ) as TokenCaipAssetType[];
    const nftAssetTypes = assetTypes.filter((assetType) =>
      assetType.includes('/trc721'),
    ) as NftCaipAssetType[];

    return {
      nativeAssetTypes,
      tokenTrc10AssetTypes,
      tokenTrc20AssetTypes,
      nftAssetTypes,
    };
  }

  #getNativeTokensMetadata(
    assetTypes: NativeCaipAssetType[],
  ): Record<CaipAssetType, FungibleAssetMetadata | null> {
    const nativeTokensMetadata: Record<
      CaipAssetType,
      FungibleAssetMetadata | null
    > = {};

    for (const assetType of assetTypes) {
      // const { chainId } = parseCaipAssetType(assetType);
      nativeTokensMetadata[assetType] = {
        name: 'TRX',
        symbol: 'TRX',
        fungible: true as const,
        // iconUrl: `${this.#configProvider.get().staticApi.baseUrl}/api/v2/tokenIcons/assets/tron/${chainId}/slip44/195.png`,
        iconUrl:
          'https://altcoinsbox.com/wp-content/uploads/2023/01/tron-coin-logo-300x300.webp',
        units: [
          {
            name: 'TRX',
            symbol: 'TRX',
            decimals: 9,
          },
        ],
      };
    }

    return nativeTokensMetadata;
  }

  async #getTRC10TokensMetadata(
    assetTypes: TokenCaipAssetType[],
    scope: Network,
  ): Promise<Record<TokenCaipAssetType, FungibleAssetMetadata | null>> {
    const connection = this.#connection.getConnection(scope);
    const metadata = await Promise.all(
      assetTypes.map(async (assetType) => {
        const { assetReference } = parseCaipAssetType(assetType);
        console.log('assetReference', assetReference);
        const tokenMetadata = await connection.trx.getTokenByID(assetReference);

        return {
          [assetType]: {
            name: tokenMetadata.name,
            symbol: tokenMetadata.abbr,
            fungible: true as const,
            iconUrl: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/assets/${assetReference}/logo.png`,
            units: [
              {
                decimals: tokenMetadata.precision,
                symbol: tokenMetadata.abbr,
              },
            ],
          },
        };
      }),
    );

    return metadata.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});
  }

  async #getTRC20TokensMetadata(
    assetTypes: TokenCaipAssetType[],
    scope: Network,
  ): Promise<Record<TokenCaipAssetType, FungibleAssetMetadata | null>> {
    const metadata = await Promise.all(
      assetTypes.map(async (assetType) => {
        const { assetReference } = parseCaipAssetType(assetType);

        const contract = await this.#connection
          .getConnection(scope)
          .trx.getContract(assetReference);

        const name = await contract.name();
        const symbol = await contract.symbol();
        const decimals = await contract.decimals();

        return {
          [assetType]: {
            name,
            symbol,
            fungible: true as const,
            iconUrl: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/assets/${assetReference}/logo.png`,
            units: [{ decimals, symbol }],
          },
        };
      }),
    );

    return metadata.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});
  }

  async #getNftsMetadata(
    _assetTypes: NftCaipAssetType[],
  ): Promise<Record<NftCaipAssetType, NonFungibleAssetMetadata | null>> {
    return {}; // TODO: Implement me
  }

  async fetchAssetsByAccount(
    account: KeyringAccount,
    scope: Network,
    tronAccount: Account,
  ): Promise<AssetEntity[]> {
    const [nativeAsset, trc10Assets] = await Promise.allSettled([
      this.#getNativeAsset(account, scope, tronAccount),
      this.#fetchTRC10Assets(account, scope, tronAccount),
      this.#fetchTRC20Assets(account, scope),
    ]);

    return [
      ...(nativeAsset.status === 'fulfilled' ? [nativeAsset.value] : []),
      ...(trc10Assets.status === 'fulfilled' ? trc10Assets.value : []),
    ];
  }

  #getNativeAsset(
    account: KeyringAccount,
    scope: Network,
    tronAccount: Account,
  ): AssetEntity {
    const asset: AssetEntity = {
      assetType: `${scope}/slip44:195` as NativeCaipAssetType,
      keyringAccountId: account.id,
      network: scope,
      address: account.address,
      symbol: 'TRX',
      decimals: 9,
      rawAmount: tronAccount?.balance?.toString(),
      uiAmount: tronAccount?.balance?.toString(),
    };

    return asset;
  }

  async #fetchTRC10Assets(
    account: KeyringAccount,
    scope: Network,
    tronAccount: Account,
  ): Promise<AssetEntity[]> {
    const connection = this.#connection.getConnection(scope);

    const responses = await Promise.allSettled(
      tronAccount.assetV2.map(async (asset): Promise<AssetEntity> => {
        if (!asset.key || !asset.value) {
          throw new Error('Asset ID is required');
        }

        const metadata = await connection.trx.getTokenByID(asset.key);

        return {
          assetType: `${scope}/trc10:${asset.key}` as TokenCaipAssetType,
          keyringAccountId: account.id,
          network: scope,
          symbol: metadata.abbr,
          decimals: metadata.precision,
          mint: metadata.owner_address,
          rawAmount: asset.value.toString(),
          uiAmount: asset.value.toString(),
          pubkey: asset.key.toString(),
        };
      }),
    );

    return responses.flatMap((response) =>
      response.status === 'fulfilled' ? response.value : [],
    );
  }

  async #fetchTRC20Assets(
    _account: KeyringAccount,
    _scope: Network,
  ): Promise<AssetEntity[]> {
    return []; // TODO: Implement me
  }

  /**
   * Checks if the asset has changed compared to passed assets lookup.
   *
   * @param asset - The asset to check.
   * @param assetsLookup - The lookup table to check against.
   * @returns True if the asset has changed, false otherwise.
   */
  static hasChanged(asset: AssetEntity, assetsLookup: AssetEntity[]): boolean {
    const savedAsset = assetsLookup.find(
      (item) =>
        item.keyringAccountId === asset.keyringAccountId &&
        item.assetType === asset.assetType,
    );

    if (!savedAsset) {
      return true;
    }

    return savedAsset.rawAmount !== asset.rawAmount;
  }

  async saveMany(assets: AssetEntity[]): Promise<void> {
    this.#logger.info('Saving assets', assets);

    const savedAssets = await this.getAll();

    // Update the state atomically
    await this.#state.update((stateValue) => {
      const newState = cloneDeep(stateValue);
      for (const asset of assets) {
        const { keyringAccountId } = asset;
        const accountAssets = cloneDeep(
          newState.assets[keyringAccountId] ?? [],
        );

        // Avoid duplicates. If same asset is already saved, override it.
        const existingAssetIndex = accountAssets.findIndex(
          (item) =>
            item.assetType === asset.assetType &&
            item.keyringAccountId === asset.keyringAccountId,
        );

        if (existingAssetIndex === -1) {
          accountAssets.push(asset);
        } else {
          accountAssets[existingAssetIndex] = asset;
        }

        newState.assets[keyringAccountId] = accountAssets;
      }
      return newState;
    });

    this.#logger.info('Saved assets', { savedAssets });

    const hasZeroRawAmount = (asset: AssetEntity): boolean =>
      asset.rawAmount === '0';
    const hasNonZeroRawAmount = (asset: AssetEntity): boolean =>
      !hasZeroRawAmount(asset);

    // Notify the extension about the new assets in a single event
    const isNew = (asset: AssetEntity): boolean =>
      !savedAssets.find(
        (item) =>
          item.keyringAccountId === asset.keyringAccountId &&
          item.assetType === asset.assetType,
      );

    const wasSavedWithZeroRawAmount = (asset: AssetEntity): boolean => {
      const savedAsset = savedAssets.find(
        (item) =>
          item.keyringAccountId === asset.keyringAccountId &&
          item.assetType === asset.assetType,
      );

      return savedAsset !== undefined && hasZeroRawAmount(savedAsset);
    };

    const assetListUpdatedPayload = assets.reduce<
      AccountAssetListUpdatedEvent['params']['assets']
    >(
      (acc, asset) => ({
        ...acc,
        [asset.keyringAccountId]: {
          added: [
            ...(acc[asset.keyringAccountId]?.added ?? []),
            ...((isNew(asset) || wasSavedWithZeroRawAmount(asset)) &&
            hasNonZeroRawAmount(asset)
              ? [asset.assetType]
              : []),
          ],
          removed: [
            ...(acc[asset.keyringAccountId]?.removed ?? []),
            ...(hasZeroRawAmount(asset) ? [asset.assetType] : []),
          ],
        },
      }),
      {},
    );

    const isEmptyAccountAssetListUpdatedPayload = Object.values(
      assetListUpdatedPayload,
    )
      .map((item) => item.added.length + item.removed.length)
      .every((item) => item === 0);

    if (isEmptyAccountAssetListUpdatedPayload) {
      this.#logger.info('No account asset list updated', {
        assetListUpdatedPayload,
      });
    } else {
      this.#logger.info('Updating account asset list', {
        isEmptyAccountAssetListUpdatedPayload,
        assetListUpdatedPayload,
      });

      await emitSnapKeyringEvent(snap, KeyringEvent.AccountAssetListUpdated, {
        assets: assetListUpdatedPayload,
      });

      this.#logger.info('Account asset list updated', {
        assetListUpdatedPayload,
      });
    }

    // Notify the extension about the changed balances in a single event

    const hasChanged = (asset: AssetEntity): boolean =>
      AssetsService.hasChanged(asset, savedAssets);

    const balancesUpdatedPayload = assets
      .filter(hasNonZeroRawAmount)
      .filter(hasChanged)
      .reduce<AccountBalancesUpdatedEvent['params']['balances']>(
        (acc, asset) => ({
          ...acc,
          [asset.keyringAccountId]: {
            ...(acc[asset.keyringAccountId] ?? {}),
            [asset.assetType]: {
              unit: asset.symbol,
              amount: asset.uiAmount,
            },
          },
        }),
        {},
      );
    const isEmptyAccountBalancesUpdatedPayload = Object.values(
      balancesUpdatedPayload,
    )
      .map((item) => Object.keys(item).length)
      .every((item) => item === 0);

    if (isEmptyAccountBalancesUpdatedPayload) {
      this.#logger.info('No account balances updated', {
        balancesUpdatedPayload,
      });
    } else {
      this.#logger.info('Updating account balances', {
        balancesUpdatedPayload,
      });
      console.log(
        'balancesUpdatedPayload',
        JSON.stringify(balancesUpdatedPayload, null, 2),
      );
      await emitSnapKeyringEvent(snap, KeyringEvent.AccountBalancesUpdated, {
        balances: balancesUpdatedPayload,
      });

      this.#logger.info('Account balances updated', {
        balancesUpdatedPayload,
      });
    }
  }

  async getAll(): Promise<AssetEntity[]> {
    const assetsByAccount =
      (await this.#state.getKey<UnencryptedStateValue['assets']>('assets')) ??
      {};

    return Object.values(assetsByAccount).flat();
  }

  async getByKeyringAccountId(
    keyringAccountId: string,
  ): Promise<AssetEntity[]> {
    return this.#assetsRepository.getByAccountId(keyringAccountId);
  }
}
