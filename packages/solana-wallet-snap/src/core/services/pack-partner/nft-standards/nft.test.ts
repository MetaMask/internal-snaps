import {
  AccountRole,
  address,
  getAddressEncoder,
  getBase64Encoder,
} from '@solana/kit';
import type { Address, AccountMeta, Instruction } from '@solana/kit';

import { validateNftMetadata, validateNftTransfer } from './nft';
import { TOKEN_METADATA_PROGRAM_ADDRESS } from './programs';

const PROVIDER = address('GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3');
const USER = address('Ex5FM97zzczYpmKcDEQazswrVZW9jh5i3tDe7Sr4LtBU');
const NFT = address('4NGjdY9LHWhbWGysoeXTgrQq8CLNm5SzZKuHfzerXByW');
const INVENTORY = address('HiGHqwYddP5N2waqUmXPdaASpMpUEvfqPr2fSawctEb');
const COLLECTION = address('CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf');
const OTHER = address('11111111111111111111111111111112');

// Accounts from the ordinary Pack Partner `nft` buyback on 2026-10-07:
// https://solscan.io/tx/3fhT71ykVsxVALjpmriH5gBXM1M34hYNXx9Cy6Tcev2HQwfRcrNRN69rfsWsP5u29MraiC75VtmCbAVwCuqZEfEs
const accounts: readonly AccountMeta[] = [
  {
    address: address('AY33CnRGMcrQHnUjdxxbiz7YRp4EnXGJDkHNPbuNTAR9'),
    role: AccountRole.WRITABLE,
  },
  { address: USER, role: AccountRole.READONLY_SIGNER },
  {
    address: address('4KtUyXvdXjpDuGfFTknH5CQofK8WKqBKA6g6zGdyqxiC'),
    role: AccountRole.WRITABLE,
  },
  { address: INVENTORY, role: AccountRole.READONLY },
  { address: NFT, role: AccountRole.READONLY },
  {
    address: address('FEoscb7BpuqdwDc4Dh5NSwdGDghQ7XkqTPknzGAzZLs3'),
    role: AccountRole.WRITABLE,
  },
  { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
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
  { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
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
const realMetadataBase64 =
  'BLhJvSf1pWAOic+nA+axhrqDqHE78GhDY+x+MkbVM/zyMgYMpM/f8ixVP7Y6cXTATAgkKxuAUcUsCHYarTzgJFUgAAAAMjAxNyAjNTggSkFQQU5FU0UgU1VOICYgTU9PTiBTSEkKAAAAQ09MTEVDVE9SAMgAAABodHRwczovL2Fyd2VhdmUubmV0L0Vhd1Y4dmNSbUJ2RGZNd1h3dmVjOHREUWtFU0V0SE9QX3FiRnEwN1lYcGMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMgAAQEAAAC4Sb0n9aVgDonPpwPmsYa6g6hxO/BoQ2PsfjJG1TP88gBkAAEB/gEAAQGmenUWm3sm4gcWrNZ52hLQ6Qw2PFdY1cFlpTDn2o/CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

function metadataBytes({
  mint = NFT,
  standard = 0,
  verified = 1,
  collection = COLLECTION,
}: {
  mint?: Address;
  standard?: number;
  verified?: number;
  collection?: Address;
} = {}): Uint8Array {
  const encoder = getAddressEncoder();
  return new Uint8Array([
    4,
    ...encoder.encode(OTHER),
    ...encoder.encode(mint),
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
    0, // Seller fee basis points.
    0, // No creators.
    0,
    1, // Primary sale and mutable flags.
    0, // No edition nonce.
    1,
    standard,
    1,
    verified,
    ...encoder.encode(collection),
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

describe('validateNftTransfer', () => {
  it('rejects a buyback transfer that keeps the NFT in the user wallet', async () => {
    const transfer = {
      ...instruction,
      accounts: replaceAccount(3, { address: USER }),
    };
    await expect(
      validateNftTransfer(transfer, USER, NFT, PROVIDER, PROVIDER),
    ).rejects.toThrow('Unexpected Pack Partner NFT recipient.');
  });

  it('accepts the transaction-wide writable signer role when the user pays network fees', async () => {
    const transfer = {
      ...instruction,
      accounts: userPaidAccounts,
    };

    expect(
      await validateNftTransfer(transfer, USER, NFT, PROVIDER, USER),
    ).toMatchObject({ recipient: INVENTORY });
  });

  it('rejects a readonly user when the user pays network fees', async () => {
    await expect(
      validateNftTransfer(instruction, USER, NFT, PROVIDER, USER),
    ).rejects.toThrow(/transfer accounts/u);
  });

  it('rejects a writable user when Pack Partner pays network fees', async () => {
    const transfer = {
      ...instruction,
      accounts: userPaidAccounts,
    };

    await expect(
      validateNftTransfer(transfer, USER, NFT, PROVIDER, PROVIDER),
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

    await validateNftTransfer(
      transfer,
      USER,
      NFT,
      devnetProvider,
      devnetProvider,
    );

    await expect(
      validateNftTransfer(transfer, USER, NFT, PROVIDER, PROVIDER),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
  });

  it('accepts the observed transfer and returns the exact accounts to check', async () => {
    expect(
      await validateNftTransfer(instruction, USER, NFT, PROVIDER, PROVIDER),
    ).toStrictEqual({
      recipient: INVENTORY,
      sourceToken: accounts[0]?.address,
      destinationToken: accounts[2]?.address,
      metadata: accounts[5]?.address,
    });
  });

  it.each(accounts.map((_, index) => index))(
    'rejects a substituted account at index %i',
    async (index) => {
      const changed = {
        ...instruction,
        accounts: replaceAccount(index, { address: OTHER }),
      };
      await expect(
        validateNftTransfer(changed, USER, NFT, PROVIDER, PROVIDER),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it.each(accounts.map((_, index) => index))(
    'rejects extra privileges at index %i',
    async (index) => {
      const changed = {
        ...instruction,
        accounts: changeAccountRole(index),
      };
      await expect(
        validateNftTransfer(changed, USER, NFT, PROVIDER, PROVIDER),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it('rejects wrong amount, extra accounts, wallet, asset and recipient', async () => {
    await expect(
      validateNftTransfer(
        {
          ...instruction,
          data: new Uint8Array([49, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]),
        },
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
      ),
    ).rejects.toThrow(/Pack Partner/u);
    await expect(
      validateNftTransfer(
        {
          ...instruction,
          accounts: [...accounts, accounts[0] as AccountMeta],
        },
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
      ),
    ).rejects.toThrow(/Pack Partner/u);
    await expect(
      validateNftTransfer(instruction, OTHER, NFT, PROVIDER, PROVIDER),
    ).rejects.toThrow(/Pack Partner/u);
    await expect(
      validateNftTransfer(instruction, USER, OTHER, PROVIDER, PROVIDER),
    ).rejects.toThrow(/Pack Partner/u);
    await expect(
      validateNftTransfer(
        {
          ...instruction,
          accounts: replaceAccount(3, { address: OTHER }),
        },
        USER,
        NFT,
        PROVIDER,
        PROVIDER,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });
});

describe('validateNftMetadata', () => {
  it('accepts the real on-chain NonFungible metadata', () => {
    expect(() =>
      validateNftMetadata(
        getBase64Encoder().encode(realMetadataBase64),
        NFT,
        COLLECTION,
      ),
    ).not.toThrow(/Pack Partner|Unexpected/u);
  });

  it('requires selected mint, classic NFT standard and verified Pack Partner collection', () => {
    expect(() =>
      validateNftMetadata(metadataBytes(), NFT, COLLECTION),
    ).not.toThrow(/Pack Partner|Unexpected/u);
    for (const bytes of [
      metadataBytes({ mint: OTHER }),
      metadataBytes({ standard: 4 }),
      metadataBytes({ verified: 0 }),
      metadataBytes({ collection: OTHER }),
    ]) {
      expect(() => validateNftMetadata(bytes, NFT, COLLECTION)).toThrow(
        /Pack Partner/u,
      );
    }
  });
});
