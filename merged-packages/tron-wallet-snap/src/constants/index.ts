import { TrxScope } from '@metamask/keyring-api';

export const NULL_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

export enum Network {
  Mainnet = TrxScope.Mainnet,
  Nile = TrxScope.Nile,
  Shasta = TrxScope.Shasta,
  Localnet = 'tron:localnet',
}

export enum KnownCaip19Id {
  TrxMainnet = `${Network.Mainnet}/slip44:195`,
  TrxNile = `${Network.Nile}/slip44:195`,
  TrxShasta = `${Network.Shasta}/slip44:195`,
  TrxLocalnet = `${Network.Localnet}/slip44:195`,

  UsdtMainnet = `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,

  // Tron Resource Assets
  EnergyMainnet = `${Network.Mainnet}/slip44:energy`,
  EnergyNile = `${Network.Nile}/slip44:energy`,
  EnergyShasta = `${Network.Shasta}/slip44:energy`,
  EnergyLocalnet = `${Network.Localnet}/slip44:energy`,

  BandwidthMainnet = `${Network.Mainnet}/slip44:bandwidth`,
  BandwidthNile = `${Network.Nile}/slip44:bandwidth`,
  BandwidthShasta = `${Network.Shasta}/slip44:bandwidth`,
  BandwidthLocalnet = `${Network.Localnet}/slip44:bandwidth`,
}

export const TokenMetadata = {
  [KnownCaip19Id.TrxMainnet]: {
    id: KnownCaip19Id.TrxMainnet,
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
  [KnownCaip19Id.TrxNile]: {
    id: KnownCaip19Id.TrxNile,
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
  [KnownCaip19Id.TrxShasta]: {
    id: KnownCaip19Id.TrxShasta,
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
  [KnownCaip19Id.TrxLocalnet]: {
    id: KnownCaip19Id.TrxLocalnet,
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
  // Energy resource metadata
  [KnownCaip19Id.EnergyMainnet]: {
    id: KnownCaip19Id.EnergyMainnet,
    name: 'Tron Energy',
    symbol: 'ENERGY',
    decimals: 0,
  },
  [KnownCaip19Id.EnergyNile]: {
    id: KnownCaip19Id.EnergyNile,
    name: 'Tron Energy',
    symbol: 'ENERGY',
    decimals: 0,
  },
  [KnownCaip19Id.EnergyShasta]: {
    id: KnownCaip19Id.EnergyShasta,
    name: 'Tron Energy',
    symbol: 'ENERGY',
    decimals: 0,
  },
  [KnownCaip19Id.EnergyLocalnet]: {
    id: KnownCaip19Id.EnergyLocalnet,
    name: 'Tron Energy',
    symbol: 'ENERGY',
    decimals: 0,
  },
  // Bandwidth resource metadata
  [KnownCaip19Id.BandwidthMainnet]: {
    id: KnownCaip19Id.BandwidthMainnet,
    name: 'Tron Bandwidth',
    symbol: 'BANDWIDTH',
    decimals: 0,
  },
  [KnownCaip19Id.BandwidthNile]: {
    id: KnownCaip19Id.BandwidthNile,
    name: 'Tron Bandwidth',
    symbol: 'BANDWIDTH',
    decimals: 0,
  },
  [KnownCaip19Id.BandwidthShasta]: {
    id: KnownCaip19Id.BandwidthShasta,
    name: 'Tron Bandwidth',
    symbol: 'BANDWIDTH',
    decimals: 0,
  },
  [KnownCaip19Id.BandwidthLocalnet]: {
    id: KnownCaip19Id.BandwidthLocalnet,
    name: 'Tron Bandwidth',
    symbol: 'BANDWIDTH',
    decimals: 0,
  },
} as const;

export const Networks = {
  [Network.Mainnet]: {
    caip2Id: Network.Mainnet,
    cluster: 'mainnet',
    name: 'Tron Mainnet',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxMainnet],
    energy: TokenMetadata[KnownCaip19Id.EnergyMainnet],
    bandwidth: TokenMetadata[KnownCaip19Id.BandwidthMainnet],
  },
  [Network.Nile]: {
    caip2Id: Network.Nile,
    cluster: 'devnet',
    name: 'Tron Nile',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxNile],
    energy: TokenMetadata[KnownCaip19Id.EnergyNile],
    bandwidth: TokenMetadata[KnownCaip19Id.BandwidthNile],
  },
  [Network.Shasta]: {
    caip2Id: Network.Shasta,
    cluster: 'testnet',
    name: 'Tron Shasta',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxShasta],
    energy: TokenMetadata[KnownCaip19Id.EnergyShasta],
    bandwidth: TokenMetadata[KnownCaip19Id.BandwidthShasta],
  },
  [Network.Localnet]: {
    caip2Id: Network.Localnet,
    cluster: 'local',
    name: 'Tron Localnet',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxLocalnet],
    energy: TokenMetadata[KnownCaip19Id.EnergyLocalnet],
    bandwidth: TokenMetadata[KnownCaip19Id.BandwidthLocalnet],
  },
} as const;
