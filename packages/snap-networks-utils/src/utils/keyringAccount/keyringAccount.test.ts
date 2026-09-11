import { asStrictKeyringAccount } from './keyringAccount';
import type { ExtendedKeyringAccount } from './keyringAccount';

describe('asStrictKeyringAccount', () => {
  const account: ExtendedKeyringAccount = {
    type: 'eip155:eoa',
    id: '4b445722-6766-4f99-ade5-c2c9295f21d0',
    address: 'TAddress0',
    options: {
      entropy: {
        type: 'mnemonic',
        id: 'entropy-source',
        derivationPath: "m/44'/195'/0'/0/0",
        groupIndex: 0,
      },
    },
    methods: ['personal_sign'],
    scopes: ['tron:mainnet'],
    entropySource: 'entropy-source',
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  it('returns only KeyringAccount fields', () => {
    expect(asStrictKeyringAccount(account)).toStrictEqual({
      type: account.type,
      id: account.id,
      address: account.address,
      options: account.options,
      methods: account.methods,
      scopes: account.scopes,
    });
  });

  it('does not include entropySource, derivationPath, or index', () => {
    expect(asStrictKeyringAccount(account)).not.toHaveProperty('entropySource');
    expect(asStrictKeyringAccount(account)).not.toHaveProperty(
      'derivationPath',
    );
    expect(asStrictKeyringAccount(account)).not.toHaveProperty('index');
  });
});
