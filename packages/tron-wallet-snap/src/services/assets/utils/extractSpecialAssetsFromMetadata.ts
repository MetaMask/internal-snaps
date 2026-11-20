import type { Asset, Caip19AssetId } from '@metamask/assets-controller';

import { assertSupportedNetwork, Networks } from '../../../constants';
import type { AssetEntity } from '../../../entities/assets';
import { toUiAmount } from '../../../utils/conversion';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readAmount = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  return typeof value === 'number' && Number.isFinite(value)
    ? value.toString()
    : undefined;
};

const getSection = (
  metadata: unknown,
  key: string,
): Record<string, unknown> | undefined => {
  if (!isRecord(metadata)) {
    return undefined;
  }

  const section = metadata[key];
  return isRecord(section) ? section : undefined;
};

const getMetadataAmount = (
  section: Record<string, unknown> | undefined,
  key: string,
): string | undefined => readAmount(section?.[key]);

/**
 * Extracts Tron special assets from the TRX asset's balance metadata.
 *
 * The Accounts API reports staking positions and account resources as
 * metadata on the TRX balance instead of separate asset entries.
 *
 * @param options - Options object.
 * @param options.accountId - Keyring account ID.
 * @param options.assets - Controller assets to read the TRX balance metadata from.
 * @returns Derived special assets keyed by CAIP-19 asset ID.
 */
export function extractSpecialAssetsFromMetadata({
  accountId,
  assets,
}: {
  accountId: string;
  assets: Asset[];
}): Map<Caip19AssetId, AssetEntity> {
  const result = new Map<Caip19AssetId, AssetEntity>();

  for (const asset of assets) {
    if (asset.id !== `${asset.chainId}/slip44:195`) {
      continue;
    }

    const scope = assertSupportedNetwork(asset.chainId);
    const { metadata } = asset.balance as { metadata?: unknown };
    const energy = getSection(metadata, 'energy');
    const bandwidth = getSection(metadata, 'bandwidth');
    const staking = getSection(metadata, 'staking');

    const entries = [
      [getMetadataAmount(energy, 'available'), Networks[scope].energy],
      [getMetadataAmount(energy, 'limit'), Networks[scope].maximumEnergy],
      [getMetadataAmount(bandwidth, 'available'), Networks[scope].bandwidth],
      [getMetadataAmount(bandwidth, 'limit'), Networks[scope].maximumBandwidth],
      [getMetadataAmount(staking, 'energy'), Networks[scope].stakedForEnergy],
      [
        getMetadataAmount(staking, 'bandwidth'),
        Networks[scope].stakedForBandwidth,
      ],
      [getMetadataAmount(staking, 'rewards'), Networks[scope].stakingRewards],
      [
        getMetadataAmount(staking, 'inLockPeriod'),
        Networks[scope].inLockPeriod,
      ],
      [
        getMetadataAmount(staking, 'readyForWithdrawal'),
        Networks[scope].readyForWithdrawal,
      ],
    ] as const;

    for (const [rawAmount, token] of entries) {
      if (rawAmount === undefined) {
        continue;
      }

      result.set(token.id, {
        assetType: token.id,
        keyringAccountId: accountId,
        network: scope,
        symbol: token.symbol,
        decimals: token.decimals,
        rawAmount,
        uiAmount: toUiAmount(rawAmount, token.decimals).toString(),
        iconUrl: token.iconUrl,
      } as AssetEntity);
    }
  }

  return result;
}
