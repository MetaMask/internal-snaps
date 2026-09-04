import { CaipAssetTypeStruct } from '@metamask/keyring-api';
import type { TrxScope } from '@metamask/keyring-api';
import { pattern } from '@metamask/superstruct';

import type { TronAccount } from '../../clients/trongrid/types';
import type { Network } from '../../constants';

export type StakedData = {
  frozenV2: TronAccount['frozenV2'];
  unfrozenV2?: TronAccount['unfrozenV2'];
  accountResource: TronAccount['account_resource'] | undefined;
};

export type NativeCaipAssetType = `${Network}/slip44:195`;
export type StakedCaipAssetType =
  `${TrxScope}/slip44:195-staked-for-${'energy' | 'bandwidth'}`;
export type ReadyForWithdrawalCaipAssetType =
  `${TrxScope}/slip44:195-ready-for-withdrawal`;
export type StakingRewardsCaipAssetType =
  `${TrxScope}/slip44:195-staking-rewards`;
export type InLockPeriodCaipAssetType = `${TrxScope}/slip44:195-in-lock-period`;
export type ResourceCaipAssetType =
  `${TrxScope}/slip44:${'energy' | 'bandwidth'}`;
export type TokenCaipAssetType = `${TrxScope}/${'trc10' | 'trc20'}:${string}`;
export type NftCaipAssetType = `${TrxScope}/trc721:${string}`;

/**
 * Validates a TRON native CAIP-19 ID (e.g., "tron:728126428/slip44:195")
 */
export const NativeCaipAssetTypeStruct = pattern(
  CaipAssetTypeStruct,
  /^tron:(728126428|3448148188|2494104990)\/slip44:195$/u,
);

/**
 * Validates a TRON staked CAIP-19 ID (e.g., "tron:728126428/slip44:195-staked-for-energy")
 */
export const StakedCaipAssetTypeStruct = pattern(
  CaipAssetTypeStruct,
  /^tron:(728126428|3448148188|2494104990)\/slip44:195-staked-for-(energy|bandwidth)$/u,
);

/**
 * Validates a TRON native CAIP-19 ID for resources (e.g., "tron:728126428/energy" or "tron:728126428/bandwidth")
 */
export const ResourceCaipAssetTypeStruct = pattern(
  CaipAssetTypeStruct,
  /^tron:(728126428|3448148188|2494104990)\/slip44:(energy|bandwidth)$/u,
);

/**
 * Validates a TRON maximum resource CAIP-19 ID (e.g., "tron:728126428/slip44:maximum-energy")
 */
export const MaximumResourceCaipAssetTypeStruct = pattern(
  CaipAssetTypeStruct,
  /^tron:(728126428|3448148188|2494104990)\/slip44:maximum-(energy|bandwidth)$/u,
);

/**
 * Validates a TRON token CAIP-19 ID (e.g., "tron:728126428/trc10:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")
 */
export const TokenCaipAssetTypeStruct = pattern(
  CaipAssetTypeStruct,
  /^tron:(728126428|3448148188|2494104990)\/(trc10|trc20):[a-zA-Z0-9]+$/u,
);

/**
 * Validates a TRON NFT CAIP-19 ID (e.g., "tron:728126428/trc721:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
 */
export const NftCaipAssetTypeStruct = pattern(
  CaipAssetTypeStruct,
  /^tron:(728126428|3448148188|2494104990)\/trc721:[a-zA-Z0-9]+$/u,
);
