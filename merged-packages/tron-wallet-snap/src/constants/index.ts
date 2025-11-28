import { TrxScope } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

export const NULL_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
export const ZERO = BigNumber(0);
export const ACCOUNT_ACTIVATION_FEE_TRX = BigNumber(1);

export enum Network {
  Mainnet = TrxScope.Mainnet,
  Nile = TrxScope.Nile,
  Shasta = TrxScope.Shasta,
}

export enum KnownCaip19Id {
  TrxMainnet = `${Network.Mainnet}/slip44:195`,
  TrxNile = `${Network.Nile}/slip44:195`,
  TrxShasta = `${Network.Shasta}/slip44:195`,

  UsdtMainnet = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,

  /**
   * Staked Tron
   */
  TrxStakedForBandwidthMainnet = `${Network.Mainnet}/slip44:195-staked-for-bandwidth`,
  TrxStakedForBandwidthNile = `${Network.Nile}/slip44:195-staked-for-bandwidth`,
  TrxStakedForBandwidthShasta = `${Network.Shasta}/slip44:195-staked-for-bandwidth`,

  TrxStakedForEnergyMainnet = `${Network.Mainnet}/slip44:195-staked-for-energy`,
  TrxStakedForEnergyNile = `${Network.Nile}/slip44:195-staked-for-energy`,
  TrxStakedForEnergyShasta = `${Network.Shasta}/slip44:195-staked-for-energy`,

  /**
   * Tron Resource Assets
   */
  EnergyMainnet = `${Network.Mainnet}/slip44:energy`,
  EnergyNile = `${Network.Nile}/slip44:energy`,
  EnergyShasta = `${Network.Shasta}/slip44:energy`,

  MaximumEnergyMainnet = `${Network.Mainnet}/slip44:maximum-energy`,
  MaximumEnergyNile = `${Network.Nile}/slip44:maximum-energy`,
  MaximumEnergyShasta = `${Network.Shasta}/slip44:maximum-energy`,

  BandwidthMainnet = `${Network.Mainnet}/slip44:bandwidth`,
  BandwidthNile = `${Network.Nile}/slip44:bandwidth`,
  BandwidthShasta = `${Network.Shasta}/slip44:bandwidth`,

  MaximumBandwidthMainnet = `${Network.Mainnet}/slip44:maximum-bandwidth`,
  MaximumBandwidthNile = `${Network.Nile}/slip44:maximum-bandwidth`,
  MaximumBandwidthShasta = `${Network.Shasta}/slip44:maximum-bandwidth`,
}

export const TRX_METADATA = {
  fungible: true as const,
  name: 'Tron',
  symbol: 'TRX',
  decimals: 6,
  iconUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
};

export const TRX_STAKED_FOR_BANDWIDTH_METADATA = {
  name: 'Staked for Bandwidth',
  symbol: 'sTRX-BANDWIDTH',
  fungible: true as const,
  decimals: 6,
  iconUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
};

export const TRX_STAKED_FOR_ENERGY_METADATA = {
  name: 'Staked for Energy',
  symbol: 'sTRX-ENERGY',
  fungible: true as const,
  decimals: 6,
  iconUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
};

export const BANDWIDTH_METADATA = {
  name: 'Bandwidth',
  symbol: 'BANDWIDTH',
  fungible: true as const,
  decimals: 0,
  iconUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
};

export const MAX_BANDWIDTH_METADATA = {
  name: 'Max Bandwidth',
  symbol: 'MAX-BANDWIDTH',
  fungible: true as const,
  decimals: 0,
  iconUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
};

export const ENERGY_METADATA = {
  name: 'Energy',
  symbol: 'ENERGY',
  fungible: true as const,
  decimals: 0,
  iconUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
};

export const MAX_ENERGY_METADATA = {
  name: 'Max Energy',
  symbol: 'MAX-ENERGY',
  fungible: true as const,
  decimals: 0,
  iconUrl:
    'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
};

export const TokenMetadata = {
  [KnownCaip19Id.TrxMainnet]: {
    id: KnownCaip19Id.TrxMainnet,
    ...TRX_METADATA,
  },
  [KnownCaip19Id.TrxNile]: {
    id: KnownCaip19Id.TrxNile,
    ...TRX_METADATA,
  },
  [KnownCaip19Id.TrxShasta]: {
    id: KnownCaip19Id.TrxShasta,
    ...TRX_METADATA,
  },
  /**
   * Tron Staked for Bandwidth Metadata
   */
  [KnownCaip19Id.TrxStakedForBandwidthMainnet]: {
    id: KnownCaip19Id.TrxStakedForBandwidthMainnet,
    ...TRX_STAKED_FOR_BANDWIDTH_METADATA,
  },
  [KnownCaip19Id.TrxStakedForBandwidthNile]: {
    id: KnownCaip19Id.TrxStakedForBandwidthNile,
    ...TRX_STAKED_FOR_BANDWIDTH_METADATA,
  },
  [KnownCaip19Id.TrxStakedForBandwidthShasta]: {
    id: KnownCaip19Id.TrxStakedForBandwidthShasta,
    ...TRX_STAKED_FOR_BANDWIDTH_METADATA,
  },
  /**
   * Tron Staked for Energy Metadata
   */
  [KnownCaip19Id.TrxStakedForEnergyMainnet]: {
    id: KnownCaip19Id.TrxStakedForEnergyMainnet,
    ...TRX_STAKED_FOR_ENERGY_METADATA,
  },
  [KnownCaip19Id.TrxStakedForEnergyNile]: {
    id: KnownCaip19Id.TrxStakedForEnergyNile,
    ...TRX_STAKED_FOR_ENERGY_METADATA,
  },
  [KnownCaip19Id.TrxStakedForEnergyShasta]: {
    id: KnownCaip19Id.TrxStakedForEnergyShasta,
    ...TRX_STAKED_FOR_ENERGY_METADATA,
  },
  /**
   * Bandwidth Resource Metadata
   */
  [KnownCaip19Id.BandwidthMainnet]: {
    id: KnownCaip19Id.BandwidthMainnet,
    ...BANDWIDTH_METADATA,
  },
  [KnownCaip19Id.BandwidthNile]: {
    id: KnownCaip19Id.BandwidthNile,
    ...BANDWIDTH_METADATA,
  },
  [KnownCaip19Id.BandwidthShasta]: {
    id: KnownCaip19Id.BandwidthShasta,
    ...BANDWIDTH_METADATA,
  },
  /**
   * Max Bandwidth Metadata
   */
  [KnownCaip19Id.MaximumBandwidthMainnet]: {
    id: KnownCaip19Id.MaximumBandwidthMainnet,
    ...MAX_BANDWIDTH_METADATA,
  },
  [KnownCaip19Id.MaximumBandwidthNile]: {
    id: KnownCaip19Id.MaximumBandwidthNile,
    ...MAX_BANDWIDTH_METADATA,
  },
  [KnownCaip19Id.MaximumBandwidthShasta]: {
    id: KnownCaip19Id.MaximumBandwidthShasta,
    ...MAX_BANDWIDTH_METADATA,
  },
  /**
   * Energy Resource Metadata
   */
  [KnownCaip19Id.EnergyMainnet]: {
    id: KnownCaip19Id.EnergyMainnet,
    ...ENERGY_METADATA,
  },
  [KnownCaip19Id.EnergyNile]: {
    id: KnownCaip19Id.EnergyNile,
    ...ENERGY_METADATA,
  },
  [KnownCaip19Id.EnergyShasta]: {
    id: KnownCaip19Id.EnergyShasta,
    ...ENERGY_METADATA,
  },
  /**
   * Max Energy Metadata
   */
  [KnownCaip19Id.MaximumEnergyMainnet]: {
    id: KnownCaip19Id.MaximumEnergyMainnet,
    ...MAX_ENERGY_METADATA,
  },
  [KnownCaip19Id.MaximumEnergyNile]: {
    id: KnownCaip19Id.MaximumEnergyNile,
    ...MAX_ENERGY_METADATA,
  },
  [KnownCaip19Id.MaximumEnergyShasta]: {
    id: KnownCaip19Id.MaximumEnergyShasta,
    ...MAX_ENERGY_METADATA,
  },
} as const;

export const Networks = {
  [Network.Mainnet]: {
    caip2Id: Network.Mainnet,
    cluster: 'mainnet',
    name: 'Tron Mainnet',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxMainnet],
    stakedForBandwidth:
      TokenMetadata[KnownCaip19Id.TrxStakedForBandwidthMainnet],
    stakedForEnergy: TokenMetadata[KnownCaip19Id.TrxStakedForEnergyMainnet],
    bandwidth: TokenMetadata[KnownCaip19Id.BandwidthMainnet],
    maximumBandwidth: TokenMetadata[KnownCaip19Id.MaximumBandwidthMainnet],
    energy: TokenMetadata[KnownCaip19Id.EnergyMainnet],
    maximumEnergy: TokenMetadata[KnownCaip19Id.MaximumEnergyMainnet],
  },
  [Network.Nile]: {
    caip2Id: Network.Nile,
    cluster: 'devnet',
    name: 'Tron Nile',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxNile],
    stakedForBandwidth: TokenMetadata[KnownCaip19Id.TrxStakedForBandwidthNile],
    stakedForEnergy: TokenMetadata[KnownCaip19Id.TrxStakedForEnergyNile],
    bandwidth: TokenMetadata[KnownCaip19Id.BandwidthNile],
    maximumBandwidth: TokenMetadata[KnownCaip19Id.MaximumBandwidthNile],
    energy: TokenMetadata[KnownCaip19Id.EnergyNile],
    maximumEnergy: TokenMetadata[KnownCaip19Id.MaximumEnergyNile],
  },
  [Network.Shasta]: {
    caip2Id: Network.Shasta,
    cluster: 'testnet',
    name: 'Tron Shasta',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxShasta],
    stakedForBandwidth:
      TokenMetadata[KnownCaip19Id.TrxStakedForBandwidthShasta],
    stakedForEnergy: TokenMetadata[KnownCaip19Id.TrxStakedForEnergyShasta],
    bandwidth: TokenMetadata[KnownCaip19Id.BandwidthShasta],
    maximumBandwidth: TokenMetadata[KnownCaip19Id.MaximumBandwidthShasta],
    energy: TokenMetadata[KnownCaip19Id.EnergyShasta],
    maximumEnergy: TokenMetadata[KnownCaip19Id.MaximumEnergyShasta],
  },
} as const;

export const SPECIAL_ASSETS: string[] = [
  KnownCaip19Id.TrxStakedForBandwidthMainnet,
  KnownCaip19Id.TrxStakedForBandwidthNile,
  KnownCaip19Id.TrxStakedForBandwidthShasta,
  KnownCaip19Id.TrxStakedForEnergyMainnet,
  KnownCaip19Id.TrxStakedForEnergyNile,
  KnownCaip19Id.TrxStakedForEnergyShasta,
  KnownCaip19Id.BandwidthMainnet,
  KnownCaip19Id.BandwidthNile,
  KnownCaip19Id.BandwidthShasta,
  KnownCaip19Id.MaximumBandwidthMainnet,
  KnownCaip19Id.MaximumBandwidthNile,
  KnownCaip19Id.MaximumBandwidthShasta,
  KnownCaip19Id.EnergyMainnet,
  KnownCaip19Id.EnergyNile,
  KnownCaip19Id.EnergyShasta,
  KnownCaip19Id.MaximumEnergyMainnet,
  KnownCaip19Id.MaximumEnergyNile,
  KnownCaip19Id.MaximumEnergyShasta,
];

export const ESSENTIAL_ASSETS: string[] = [
  KnownCaip19Id.TrxMainnet,
  KnownCaip19Id.TrxNile,
  KnownCaip19Id.TrxShasta,
  ...SPECIAL_ASSETS,
];
