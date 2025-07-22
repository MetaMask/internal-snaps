import { TrxScope } from '@metamask/keyring-api';

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
}

export const TokenMetadata = {
  [KnownCaip19Id.TrxMainnet]: {
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
  [KnownCaip19Id.TrxNile]: {
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
  [KnownCaip19Id.TrxShasta]: {
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
  [KnownCaip19Id.TrxLocalnet]: {
    name: 'Tron',
    symbol: 'TRX',
    decimals: 6,
  },
} as const;

export const Networks = {
  [Network.Mainnet]: {
    caip2Id: Network.Mainnet,
    cluster: 'mainnet',
    name: 'Tron Mainnet',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxMainnet],
  },
  [Network.Nile]: {
    caip2Id: Network.Nile,
    cluster: 'devnet',
    name: 'Tron Nile',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxNile],
  },
  [Network.Shasta]: {
    caip2Id: Network.Shasta,
    cluster: 'testnet',
    name: 'Tron Shasta',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxShasta],
  },
  [Network.Localnet]: {
    caip2Id: Network.Localnet,
    cluster: 'local',
    name: 'Tron Localnet',
    nativeToken: TokenMetadata[KnownCaip19Id.TrxLocalnet],
  },
} as const;
