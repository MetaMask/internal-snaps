import {
  AccountRole,
  address,
  getAddressEncoder,
  getStructEncoder,
  getU8Encoder,
} from '@solana/kit';
import type { AccountMeta, Instruction } from '@solana/kit';

import { validateCoreAsset, validateCoreTransfer } from './core';
import { CORE_PROGRAM_ADDRESS } from './programs';

const PROVIDER = address('GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3');
const USER = address('11111111111111111111111111111112');
const NFT = address('11111111111111111111111111111113');
const OTHER = address('11111111111111111111111111111114');
const COLLECTION = address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac');
const POKEMON_VAULT = address('Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu');
const ONE_PIECE_VAULT = address('onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs');

const accounts: readonly AccountMeta[] = [
  { address: NFT, role: AccountRole.WRITABLE },
  { address: COLLECTION, role: AccountRole.READONLY },
  { address: PROVIDER, role: AccountRole.WRITABLE_SIGNER },
  { address: USER, role: AccountRole.READONLY_SIGNER },
  { address: POKEMON_VAULT, role: AccountRole.READONLY },
  { address: CORE_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  { address: CORE_PROGRAM_ADDRESS, role: AccountRole.READONLY },
];

const userPaidAccounts = accounts.map((account) =>
  account.address === USER
    ? { ...account, role: AccountRole.WRITABLE_SIGNER }
    : account,
);

const instruction: Instruction = {
  programAddress: CORE_PROGRAM_ADDRESS,
  accounts,
  data: new Uint8Array([14, 0]),
};

const assetEncoder = getStructEncoder([
  ['key', getU8Encoder()],
  ['owner', getAddressEncoder()],
  ['updateAuthority', getU8Encoder()],
  ['collection', getAddressEncoder()],
]);
const asset = {
  key: 1,
  owner: USER,
  updateAuthority: 2,
  collection: COLLECTION,
};

function replaceAccount(
  index: number,
  changes: Partial<AccountMeta>,
): readonly AccountMeta[] {
  return accounts.map((account, offset) =>
    offset === index ? { ...account, ...changes } : account,
  );
}

function changeAccountRole(index: number): readonly AccountMeta[] {
  return replaceAccount(index, {
    role:
      accounts[index]?.role === AccountRole.READONLY
        ? AccountRole.WRITABLE
        : AccountRole.READONLY,
  });
}

const invalidInstructionData = [
  undefined,
  [],
  [14],
  [14, 1],
  [13, 0],
  [14, 0, 0],
].map((data) => (data ? new Uint8Array(data) : undefined));

describe('validateCoreTransfer', () => {
  it('uses the supplied collection and inventory policy without mainnet fallbacks', () => {
    const configuredCollection = OTHER;
    const configuredRecipient = address('11111111111111111111111111111115');
    const configuredAccounts = [...accounts];
    configuredAccounts[1] = {
      address: configuredCollection,
      role: AccountRole.READONLY,
    };
    configuredAccounts[4] = {
      address: configuredRecipient,
      role: AccountRole.READONLY,
    };
    const transfer = { ...instruction, accounts: configuredAccounts };
    expect(
      validateCoreTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, {
        collection: configuredCollection,
        recipients: [configuredRecipient],
      }),
    ).toBe(configuredRecipient);
    expect(() =>
      validateCoreTransfer(instruction, USER, NFT, PROVIDER, PROVIDER, {
        collection: configuredCollection,
        recipients: [configuredRecipient],
      }),
    ).toThrow('Unexpected Pack Partner NFT recipient.');
  });

  it('accepts the transaction-wide writable signer role when the user pays network fees', () => {
    const transfer = {
      ...instruction,
      accounts: userPaidAccounts,
    };

    expect(
      validateCoreTransfer(transfer, USER, NFT, PROVIDER, USER, {
        collection: COLLECTION,
        recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
      }),
    ).toBe(POKEMON_VAULT);
  });

  it('rejects a readonly user when the user pays network fees', () => {
    expect(() =>
      validateCoreTransfer(instruction, USER, NFT, PROVIDER, USER, {
        collection: COLLECTION,
        recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
      }),
    ).toThrow(/transfer accounts/u);
  });

  it('rejects a writable user when Pack Partner pays network fees', () => {
    const transfer = {
      ...instruction,
      accounts: userPaidAccounts,
    };

    expect(() =>
      validateCoreTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, {
        collection: COLLECTION,
        recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
      }),
    ).toThrow(/transfer accounts/u);
  });

  it('checks the injected payment authority without accepting a different signer', () => {
    const devnetProvider = address(
      'A4ahkivAG4NoZAE8Sy4qv8nn2DU9yoXRQcttuCeGtTJv',
    );
    const transfer = {
      ...instruction,
      accounts: replaceAccount(2, { address: devnetProvider }),
    };

    validateCoreTransfer(transfer, USER, NFT, devnetProvider, devnetProvider, {
      collection: COLLECTION,
      recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
    });

    expect(() =>
      validateCoreTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, {
        collection: COLLECTION,
        recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
      }),
    ).toThrow(/Pack Partner|Unexpected/u);
  });

  it.each([POKEMON_VAULT, ONE_PIECE_VAULT])(
    'accepts the observed sponsored transfer into inventory %s',
    (recipient) => {
      const transfer = {
        ...instruction,
        accounts: replaceAccount(4, { address: recipient }),
      };

      expect(
        validateCoreTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, {
          collection: COLLECTION,
          recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
        }),
      ).toBe(recipient);
    },
  );

  it('rejects another program', () => {
    expect(() =>
      validateCoreTransfer(
        { ...instruction, programAddress: OTHER },
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
        {
          collection: COLLECTION,
          recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
        },
      ),
    ).toThrow(/Pack Partner/u);
  });

  it.each(invalidInstructionData)(
    'rejects unsupported or noncanonical instruction data %j',
    (data) => {
      expect(() =>
        validateCoreTransfer(
          {
            ...instruction,
            data,
          },
          USER,
          NFT,
          PROVIDER,
          PROVIDER,
          {
            collection: COLLECTION,
            recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
          },
        ),
      ).toThrow(/Pack Partner/u);
    },
  );

  it.each([0, 1, 2, 3, 4, 5, 6])(
    'rejects a substituted account at index %i',
    (changedIndex) => {
      const transfer = {
        ...instruction,
        accounts: replaceAccount(changedIndex, { address: OTHER }),
      };

      expect(() =>
        validateCoreTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, {
          collection: COLLECTION,
          recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
        }),
      ).toThrow(/Pack Partner/u);
    },
  );

  it.each([0, 1, 2, 3, 4, 5, 6])(
    'rejects changed account privileges at index %i',
    (changedIndex) => {
      const transfer = {
        ...instruction,
        accounts: changeAccountRole(changedIndex),
      };

      expect(() =>
        validateCoreTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, {
          collection: COLLECTION,
          recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
        }),
      ).toThrow(/Pack Partner/u);
    },
  );

  it.each([
    undefined,
    accounts.slice(0, 6),
    [...accounts, { address: OTHER, role: AccountRole.WRITABLE }],
  ])('rejects missing or extra plugin accounts', (transferAccounts) => {
    expect(() =>
      validateCoreTransfer(
        {
          ...instruction,
          accounts: transferAccounts,
        },
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
        {
          collection: COLLECTION,
          recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
        },
      ),
    ).toThrow(/Pack Partner/u);
  });

  it('rejects a transfer of another NFT', () => {
    expect(() =>
      validateCoreTransfer(instruction, USER, OTHER, PROVIDER, PROVIDER, {
        collection: COLLECTION,
        recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
      }),
    ).toThrow(/Pack Partner/u);
  });

  it('rejects a different signing user', () => {
    expect(() =>
      validateCoreTransfer(instruction, OTHER, NFT, PROVIDER, PROVIDER, {
        collection: COLLECTION,
        recipients: [POKEMON_VAULT, ONE_PIECE_VAULT],
      }),
    ).toThrow(/Pack Partner/u);
  });
});

describe('validateCoreAsset', () => {
  it('checks the collection supplied by the network policy', () => {
    const bytes = assetEncoder.encode({ ...asset, collection: OTHER });
    expect(() => validateCoreAsset(bytes, USER, OTHER)).not.toThrow();
    expect(() =>
      validateCoreAsset(assetEncoder.encode(asset), USER, OTHER),
    ).toThrow('Unexpected Pack Partner NFT ownership or collection.');
  });

  it('accepts an uncompressed asset owned by the user in the verified collection', () => {
    expect(() =>
      validateCoreAsset(assetEncoder.encode(asset), USER, COLLECTION),
    ).not.toThrow(/Pack Partner|Unexpected/u);
  });

  it('accepts trailing metadata and plugin data without treating it as the prefix', () => {
    const data = new Uint8Array([...assetEncoder.encode(asset), 0, 4, 8, 255]);

    expect(() => validateCoreAsset(data, USER, COLLECTION)).not.toThrow(
      /Pack Partner|Unexpected/u,
    );
  });

  it('validates the simulated owner after transfer using the same schema', () => {
    const data = assetEncoder.encode({ ...asset, owner: POKEMON_VAULT });

    expect(() =>
      validateCoreAsset(data, POKEMON_VAULT, COLLECTION),
    ).not.toThrow(/Pack Partner|Unexpected/u);
    expect(() => validateCoreAsset(data, USER, COLLECTION)).toThrow(
      /Pack Partner/u,
    );
  });

  it.each([0, 2, 5, 255])(
    'rejects a non-AssetV1 account with key %i',
    (key) => {
      expect(() =>
        validateCoreAsset(
          assetEncoder.encode({ ...asset, key }),
          USER,
          COLLECTION,
        ),
      ).toThrow(/Pack Partner/u);
    },
  );

  it.each([0, 1, 3, 255])(
    'rejects an unverified or unknown update authority variant %i',
    (updateAuthority) => {
      expect(() =>
        validateCoreAsset(
          assetEncoder.encode({ ...asset, updateAuthority }),
          USER,
          COLLECTION,
        ),
      ).toThrow(/Pack Partner/u);
    },
  );

  it('rejects another collection', () => {
    expect(() =>
      validateCoreAsset(
        assetEncoder.encode({ ...asset, collection: OTHER }),
        USER,
        COLLECTION,
      ),
    ).toThrow(/Pack Partner/u);
  });

  it('rejects an asset owned by another account', () => {
    expect(() =>
      validateCoreAsset(
        assetEncoder.encode({ ...asset, owner: OTHER }),
        USER,
        COLLECTION,
      ),
    ).toThrow(/Pack Partner/u);
  });

  it.each([0, 1, 32, 33, 34, 65])(
    'rejects truncated data of length %i',
    (length) => {
      expect(() =>
        validateCoreAsset(
          assetEncoder.encode(asset).slice(0, length),
          USER,
          COLLECTION,
        ),
      ).toThrow(/Codec/u);
    },
  );
});
