import { is } from '@metamask/superstruct';

import { Network } from '../constants';
import { TronCaipAssetTypeStruct } from '../validation/structs';
import { extractScopesFromAssetIds, parseTronCaipAssetType } from './caip';

describe('parseTronCaipAssetType', () => {
  it('parses native asset types', () => {
    expect(parseTronCaipAssetType('tron:728126428/slip44:195')).toStrictEqual({
      assetNamespace: 'slip44',
      assetReference: '195',
      chainId: Network.Mainnet,
      chain: { namespace: 'tron', reference: '728126428' },
    });
  });

  it('parses ready-for-withdrawal asset types', () => {
    expect(
      parseTronCaipAssetType('tron:728126428/slip44:195-ready-for-withdrawal'),
    ).toStrictEqual({
      assetNamespace: 'slip44',
      assetReference: '195-ready-for-withdrawal',
      chainId: Network.Mainnet,
      chain: { namespace: 'tron', reference: '728126428' },
    });
  });

  it('parses staking-rewards asset types', () => {
    expect(
      parseTronCaipAssetType('tron:728126428/slip44:195-staking-rewards'),
    ).toStrictEqual({
      assetNamespace: 'slip44',
      assetReference: '195-staking-rewards',
      chainId: Network.Mainnet,
      chain: { namespace: 'tron', reference: '728126428' },
    });
  });

  it('parses in-lock-period asset types', () => {
    expect(
      parseTronCaipAssetType('tron:728126428/slip44:195-in-lock-period'),
    ).toStrictEqual({
      assetNamespace: 'slip44',
      assetReference: '195-in-lock-period',
      chainId: Network.Mainnet,
      chain: { namespace: 'tron', reference: '728126428' },
    });
  });

  it('rejects asset types on unsupported chains', () => {
    expect(() =>
      parseTronCaipAssetType('eip155:1/slip44:195-ready-for-withdrawal'),
    ).toThrow(
      'Expected the value to satisfy a union of `NativeCaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType`, but received: "eip155:1/slip44:195-ready-for-withdrawal"',
    );
  });
});

describe('extractScopesFromAssetIds', () => {
  it('extracts the unique scopes in order of first appearance', () => {
    expect(
      extractScopesFromAssetIds([
        'tron:728126428/slip44:195',
        'tron:728126428/slip44:bandwidth',
        'tron:3448148188/slip44:195-in-lock-period',
        'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      ]),
    ).toStrictEqual([Network.Mainnet, Network.Nile]);
  });

  it('returns an empty list for no asset IDs', () => {
    expect(extractScopesFromAssetIds([])).toStrictEqual([]);
  });

  it('rejects asset types on unsupported chains', () => {
    expect(() =>
      extractScopesFromAssetIds(['eip155:1/slip44:195-ready-for-withdrawal']),
    ).toThrow(
      'Expected the value to satisfy a union of `NativeCaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType | CaipAssetType`, but received: "eip155:1/slip44:195-ready-for-withdrawal"',
    );
  });
});

describe('TronCaipAssetTypeStruct', () => {
  it('accepts every essential asset type family', () => {
    const validAssetTypes = [
      `${Network.Mainnet}/slip44:195`,
      `${Network.Mainnet}/slip44:195-staked-for-energy`,
      `${Network.Mainnet}/slip44:195-staked-for-bandwidth`,
      `${Network.Mainnet}/slip44:195-ready-for-withdrawal`,
      `${Network.Mainnet}/slip44:195-staking-rewards`,
      `${Network.Mainnet}/slip44:195-in-lock-period`,
      `${Network.Mainnet}/slip44:energy`,
      `${Network.Mainnet}/slip44:bandwidth`,
      `${Network.Mainnet}/slip44:maximum-energy`,
      `${Network.Mainnet}/slip44:maximum-bandwidth`,
      `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,
      `${Network.Mainnet}/trc10:1002000`,
      `${Network.Mainnet}/trc721:1000001`,
    ];

    validAssetTypes.forEach((assetType) => {
      expect(is(assetType, TronCaipAssetTypeStruct)).toBe(true);
    });
  });

  it('rejects asset types on unsupported chains', () => {
    expect(
      is('eip155:1/slip44:195-ready-for-withdrawal', TronCaipAssetTypeStruct),
    ).toBe(false);
  });
});
