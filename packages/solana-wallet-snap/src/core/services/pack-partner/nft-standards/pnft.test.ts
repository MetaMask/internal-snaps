import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  getBase64Encoder,
} from '@solana/kit';
import type { Address, AccountMeta, Instruction } from '@solana/kit';

import { validatePnftMetadata, validatePnftTransfer } from './pnft';
import { TOKEN_METADATA_PROGRAM_ADDRESS } from './programs';

const PROVIDER = address('GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3');
const USER = address('GmHciaaar2PjaeFBAYVEzyeQKkhgjD4uZbwACvesWiYq');
const NFT = address('5y9GsvBdAYrTHBwybZRJQVEkEVfcyr3v9WqzRktJxdue');
const INVENTORY = address('onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs');
const COLLECTION = address('CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf');
const OTHER = address('11111111111111111111111111111112');

// Addresses and account order captured from Pack Partner's ordinary pNFT
// buyback 2UgRzKR9ixnc9tPNpVQvArKZxqj7w7wCxbnv4Q5j7bX53fspySiuWwgZdgcNugK6LRZLZWdzT5uwMD6SeeNgcELe.
const accounts: readonly AccountMeta[] = [
  {
    address: address('9kX98WLLsfaVVLikBmtiEKLVGRDvHvjPuzWYZkDsPScb'),
    role: AccountRole.WRITABLE,
  },
  { address: USER, role: AccountRole.READONLY_SIGNER },
  {
    address: address('A2oniW1AHcoxDh65KRAHH2w7bRtzu1yioAK2uFVJaXme'),
    role: AccountRole.WRITABLE,
  },
  { address: INVENTORY, role: AccountRole.READONLY },
  { address: NFT, role: AccountRole.READONLY },
  {
    address: address('8rB2JaZ3grHbJJUvFPzbo6gTHbcsSMJAjVCVEr6d4az'),
    role: AccountRole.WRITABLE,
  },
  {
    address: address('FhthTgSHeAnrjZWPDW6rM51ZUfQemj7vMqYbLVYW4Kfd'),
    role: AccountRole.READONLY,
  },
  {
    address: address('GxvMGPppyE5f4VKT9yzzwWQkW8tWKtAgZJ4Sxn4Y2sCA'),
    role: AccountRole.WRITABLE,
  },
  {
    address: address('ELpmTKn6Qus6N93SEWxoHbWjAVakFi7QFfh4Ue2aawFr'),
    role: AccountRole.WRITABLE,
  },
  { address: USER, role: AccountRole.READONLY_SIGNER },
  { address: PROVIDER, role: AccountRole.WRITABLE_SIGNER },
  {
    address: address('11111111111111111111111111111111'),
    role: AccountRole.READONLY,
  },
  {
    address: address('Sysvar1nstructions1111111111111111111111111'),
    role: AccountRole.READONLY,
  },
  {
    address: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    role: AccountRole.READONLY,
  },
  {
    address: address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    role: AccountRole.READONLY,
  },
  {
    address: address('auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg'),
    role: AccountRole.READONLY,
  },
  { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
];
const userPaidAccounts = accounts.map((account) =>
  account.address === USER
    ? { ...account, role: AccountRole.WRITABLE_SIGNER }
    : account,
);

const instruction: Instruction = {
  programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
  accounts,
  data: new Uint8Array([49, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
};

// The actual on-chain metadata account for the same NFT. The non-security
// strings are deliberately ignored by the validator.
const realMetadataBase64 = [
  'BLhJvSf1pWAOic+nA+axhrqDqHE78GhDY+x+MkbVM/zySdCg0GaJEYgexy1fZPHRAk4bNxy+HSdW3Qs9',
  'cACblkUgAAAAMjAyNSAjMDA1IFNpbHZlcnMgUmF5bGVpZ2ggUFNBIDEKAAAAQ09MTEVDVE9SAMgAAABo',
  'dHRwczovL2Fyd2VhdmUubmV0L2EyRzRCOW5BM3hIZE0tamczb2k4c0k1WjNQd0d3cmtTeXJrWGRaSW1J',
  'ejAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAMgAAQEAAAC4Sb0n9aVgDonPpwPmsYa6g6hxO/BoQ2PsfjJG1TP88gBk',
  'AAEB/wEEAQGmenUWm3sm4gcWrNZ52hLQ6Qw2PFdY1cFlpTDn2o/CKAAAAQABCYYiheNxCpDVHZ5HAt6a',
  'ndXp/cisgdLSrNHh3cgk/sQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'AAAAAAAAAA==',
].join('');

function metadataBytes({
  key = 4,
  mint = NFT,
  standard = 4,
  verified = 1,
  collection = COLLECTION,
}: {
  key?: number;
  mint?: Address;
  standard?: number;
  verified?: number;
  collection?: Address;
} = {}): Uint8Array {
  const addressEncoder = getAddressEncoder();
  return new Uint8Array([
    key,
    ...addressEncoder.encode(OTHER), // Update authority.
    ...addressEncoder.encode(mint),
    0,
    0,
    0,
    0, // Empty name.
    0,
    0,
    0,
    0, // Empty symbol.
    0,
    0,
    0,
    0, // Empty URI.
    0,
    0, // Seller fee.
    0, // No creators.
    0,
    1, // Primary sale and mutable flags.
    0, // No edition nonce.
    1,
    standard, // Token standard Option<ProgrammableNonFungible>.
    1,
    verified,
    ...addressEncoder.encode(collection),
  ]);
}

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

describe('validatePnftTransfer', () => {
  it('derives the destination from the configured inventory, not a fixed mainnet address', async () => {
    const [destinationToken] = await findAssociatedTokenPda({
      owner: OTHER,
      mint: NFT,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [destinationTokenRecord] = await getProgramDerivedAddress({
      programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
      seeds: [
        'metadata',
        getAddressEncoder().encode(TOKEN_METADATA_PROGRAM_ADDRESS),
        getAddressEncoder().encode(NFT),
        'token_record',
        getAddressEncoder().encode(destinationToken),
      ],
    });
    const configuredAccounts = [...accounts];
    configuredAccounts[2] = {
      address: destinationToken,
      role: AccountRole.WRITABLE,
    };
    configuredAccounts[3] = { address: OTHER, role: AccountRole.READONLY };
    configuredAccounts[8] = {
      address: destinationTokenRecord,
      role: AccountRole.WRITABLE,
    };
    const transfer = { ...instruction, accounts: configuredAccounts };
    expect(
      await validatePnftTransfer(
        transfer,
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
        OTHER,
      ),
    ).toMatchObject({
      recipient: OTHER,
      destinationToken,
      destinationTokenRecord,
    });
    await expect(
      validatePnftTransfer(instruction, USER, NFT, PROVIDER, PROVIDER, OTHER),
    ).rejects.toThrow('Unexpected Pack Partner pNFT transfer accounts.');
  });

  it('accepts the transaction-wide writable signer role when the user pays network fees', async () => {
    const transfer = {
      ...instruction,
      accounts: userPaidAccounts,
    };

    expect(
      await validatePnftTransfer(
        transfer,
        USER,
        NFT,
        PROVIDER,
        USER,
        INVENTORY,
      ),
    ).toMatchObject({ recipient: INVENTORY });
  });

  it('rejects a readonly user when the user pays network fees', async () => {
    await expect(
      validatePnftTransfer(instruction, USER, NFT, PROVIDER, USER, INVENTORY),
    ).rejects.toThrow(/transfer accounts/u);
  });

  it('rejects a writable user when Pack Partner pays network fees', async () => {
    const transfer = {
      ...instruction,
      accounts: userPaidAccounts,
    };

    await expect(
      validatePnftTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, INVENTORY),
    ).rejects.toThrow(/transfer accounts/u);
  });

  it('checks the injected payment authority without accepting a different signer', async () => {
    const devnetProvider = address(
      'A4ahkivAG4NoZAE8Sy4qv8nn2DU9yoXRQcttuCeGtTJv',
    );
    const transfer = {
      ...instruction,
      accounts: replaceAccount(10, { address: devnetProvider }),
    };

    await validatePnftTransfer(
      transfer,
      USER,
      NFT,
      devnetProvider,
      devnetProvider,
      INVENTORY,
    );

    await expect(
      validatePnftTransfer(transfer, USER, NFT, PROVIDER, PROVIDER, INVENTORY),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
  });

  it('accepts the observed TransferV1 and returns the checked addresses', async () => {
    const validated = await validatePnftTransfer(
      instruction,
      USER,
      NFT,
      PROVIDER,
      PROVIDER,
      INVENTORY,
    );

    expect(validated).toStrictEqual({
      recipient: INVENTORY,
      sourceToken: accounts[0]?.address,
      destinationToken: accounts[2]?.address,
      sourceTokenRecord: accounts[7]?.address,
      destinationTokenRecord: accounts[8]?.address,
      metadata: accounts[5]?.address,
      edition: accounts[6]?.address,
    });
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
    'rejects a substituted account at index %i',
    async (changedIndex) => {
      const changed = {
        ...instruction,
        accounts: replaceAccount(changedIndex, { address: OTHER }),
      };

      await expect(
        validatePnftTransfer(changed, USER, NFT, PROVIDER, PROVIDER, INVENTORY),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
    'rejects changed account privileges at index %i',
    async (changedIndex) => {
      const changed = {
        ...instruction,
        accounts: changeAccountRole(changedIndex),
      };

      await expect(
        validatePnftTransfer(changed, USER, NFT, PROVIDER, PROVIDER, INVENTORY),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it('rejects an unreviewed transfer amount or additional accounts', async () => {
    await expect(
      validatePnftTransfer(
        {
          ...instruction,
          data: new Uint8Array([49, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]),
        },
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
        INVENTORY,
      ),
    ).rejects.toThrow(/Pack Partner/u);
    await expect(
      validatePnftTransfer(
        {
          ...instruction,
          accounts: [...accounts, accounts[0] as AccountMeta],
        },
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
        INVENTORY,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it('rejects a mismatched user or NFT context', async () => {
    await expect(
      validatePnftTransfer(
        instruction,
        OTHER,
        NFT,
        PROVIDER,
        PROVIDER,
        INVENTORY,
      ),
    ).rejects.toThrow(/Pack Partner/u);
    await expect(
      validatePnftTransfer(
        instruction,
        USER,
        OTHER,
        PROVIDER,
        PROVIDER,
        INVENTORY,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });
});

describe('validatePnftMetadata', () => {
  it('accepts the observed on-chain metadata', () => {
    expect(() =>
      validatePnftMetadata(
        getBase64Encoder().encode(realMetadataBase64),
        NFT,
        COLLECTION,
      ),
    ).not.toThrow(/Pack Partner|Unexpected/u);
  });

  it('accepts only the selected mint in the verified Pack Partner pNFT collection', () => {
    expect(() =>
      validatePnftMetadata(metadataBytes(), NFT, COLLECTION),
    ).not.toThrow(/Pack Partner|Unexpected/u);
    expect(() =>
      validatePnftMetadata(metadataBytes({ mint: OTHER }), NFT, COLLECTION),
    ).toThrow(/mint/u);
    expect(() =>
      validatePnftMetadata(
        metadataBytes({ collection: OTHER }),
        NFT,
        COLLECTION,
      ),
    ).toThrow(/collection/u);
    expect(() =>
      validatePnftMetadata(metadataBytes({ verified: 0 }), NFT, COLLECTION),
    ).toThrow(/collection/u);
  });

  it('rejects other NFT standards and malformed accounts', () => {
    expect(() =>
      validatePnftMetadata(metadataBytes({ standard: 0 }), NFT, COLLECTION),
    ).toThrow(/standard/u);
    expect(() =>
      validatePnftMetadata(metadataBytes({ key: 1 }), NFT, COLLECTION),
    ).toThrow(/discriminator/u);
    expect(() =>
      validatePnftMetadata(metadataBytes().slice(0, 64), NFT, COLLECTION),
    ).toThrow(/length/u);
  });
});
