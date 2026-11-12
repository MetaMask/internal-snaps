import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  AccountRole,
  address,
  getAddressEncoder,
  getBase58Encoder,
  getProgramDerivedAddress,
  getU32Encoder,
  getU64Encoder,
} from '@solana/kit';
import type { AccountMeta, Address, Instruction } from '@solana/kit';

import { validateCnftCoreTransfer } from './cnft-core';
import {
  BUBBLEGUM_PROGRAM_ADDRESS,
  COMPRESSION_PROGRAM_ADDRESS,
} from './programs';

const USER = address('11111111111111111111111111111112');
const PROVIDER = address('GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3');
const OTHER = address('11111111111111111111111111111113');
const TREE = address('11111111111111111111111111111114');
const COLLECTION = address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac');
const RECIPIENT = address('Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu');
const PROOF = address('11111111111111111111111111111116');
const NOOP = address('mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3');
const DISCRIMINATOR = [119, 40, 6, 235, 234, 221, 248, 49];

function transferData({
  nonce = 42n,
  assetDataHash = false,
  flags = false,
}: {
  nonce?: bigint;
  assetDataHash?: boolean;
  flags?: boolean;
} = {}): Uint8Array {
  return new Uint8Array([
    ...DISCRIMINATOR,
    ...new Uint8Array(96),
    ...(assetDataHash ? [1, ...new Uint8Array(32)] : [0]),
    ...(flags ? [1, 0] : [0]),
    ...getU64Encoder().encode(nonce),
    ...getU32Encoder().encode(42),
  ]);
}

async function fixture(feePayer: Address = PROVIDER): Promise<{
  instruction: Instruction;
  assetId: Address;
  treeConfig: Address;
}> {
  const treeBytes = getAddressEncoder().encode(TREE);
  const [treeConfig] = await getProgramDerivedAddress({
    programAddress: BUBBLEGUM_PROGRAM_ADDRESS,
    seeds: [treeBytes],
  });
  const [assetId] = await getProgramDerivedAddress({
    programAddress: BUBBLEGUM_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode('asset'),
      treeBytes,
      getU64Encoder().encode(42n),
    ],
  });
  const userRole =
    feePayer === USER
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  return {
    assetId,
    treeConfig,
    instruction: {
      programAddress: BUBBLEGUM_PROGRAM_ADDRESS,
      data: transferData(),
      accounts: [
        { address: treeConfig, role: AccountRole.WRITABLE },
        { address: PROVIDER, role: AccountRole.WRITABLE_SIGNER },
        { address: USER, role: userRole },
        { address: USER, role: userRole },
        { address: USER, role: userRole },
        { address: RECIPIENT, role: AccountRole.READONLY },
        { address: TREE, role: AccountRole.WRITABLE },
        { address: COLLECTION, role: AccountRole.READONLY },
        { address: NOOP, role: AccountRole.READONLY },
        { address: COMPRESSION_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        { address: PROOF, role: AccountRole.READONLY },
      ],
    },
  };
}

function replaceAccount(
  instruction: Instruction,
  index: number,
  changes: Partial<AccountMeta>,
): Instruction {
  return {
    ...instruction,
    accounts: instruction.accounts?.map((account, offset) =>
      offset === index ? { ...account, ...changes } : account,
    ),
  };
}

describe('validateCnftCoreTransfer', () => {
  it('validates the public Pack Partner devnet Bubblegum V2 buyback fixture', async () => {
    // Solana devnet transaction GWqYLJgJxmhK9jb1zKm9wSKp4sSLv25UK5u1QxxVfy33CmFjSfzmoeWzvXdf66igfMMAjNzWkno5bUdhTewk1wG.
    // Only its public transfer instruction is retained; no private keys or RPC calls.
    const instruction: Instruction = {
      programAddress: BUBBLEGUM_PROGRAM_ADDRESS,
      data: getBase58Encoder().encode(
        '27UPuAgK5AjaFh2mH4eRfpcc2okhmLKXxiBXBotAqVWGFbUR7J96KyPnmrjToBjfs9UZfSyCHz19wx9Z2vswpjeAyuVx5tJqYMMuAQdzQyP1vqxa6KUhvkpSyiPSdG1xKnGLZYDZZVP5T92wxgjkmMMMTH3e8D81YG1rfaPyruMSWsc3qTxhBU6QTmmq89Fo1W5bEW96Pxm9UuD',
      ),
      accounts: [
        {
          address: address('KUg3yscy8HrcRrzWkCjqkMSMcAW8DBqFonov4fDb7F8'),
          role: AccountRole.WRITABLE,
        },
        {
          address: address('A4ahkivAG4NoZAE8Sy4qv8nn2DU9yoXRQcttuCeGtTJv'),
          role: AccountRole.WRITABLE_SIGNER,
        },
        {
          address: address('6C8CgF1aGHRconBnqrXp4QrinccvK71Ehk5scbiyJnLX'),
          role: AccountRole.READONLY_SIGNER,
        },
        {
          address: address('6C8CgF1aGHRconBnqrXp4QrinccvK71Ehk5scbiyJnLX'),
          role: AccountRole.READONLY_SIGNER,
        },
        {
          address: address('6C8CgF1aGHRconBnqrXp4QrinccvK71Ehk5scbiyJnLX'),
          role: AccountRole.READONLY_SIGNER,
        },
        {
          address: address('MidJLFXyuVs6s7kKuc9BtwZ22jzJ9zNz6T32RKHen4u'),
          role: AccountRole.READONLY,
        },
        {
          address: address('CCTREEA8hbsXNCf77tUEgbHaBFV9CmgfuQWfeNXHQ34h'),
          role: AccountRole.WRITABLE,
        },
        {
          address: address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac'),
          role: AccountRole.READONLY,
        },
        {
          address: address('mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3'),
          role: AccountRole.READONLY,
        },
        {
          address: address('mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW'),
          role: AccountRole.READONLY,
        },
        {
          address: address('11111111111111111111111111111111'),
          role: AccountRole.READONLY,
        },
        {
          address: address('Hq2gfT2o5jXoY8bAtnrVBupNmyJMpZJ2JxM5aycva1VN'),
          role: AccountRole.READONLY,
        },
        {
          address: address('BYBsQqTq959hvt35vCPsSV1pYyjKsss5mu5wxa75pQvh'),
          role: AccountRole.READONLY,
        },
        {
          address: address('HXDdsoo79LRUofLrSzUeVLtGnMdWdLtHUcNBwnts4NSg'),
          role: AccountRole.READONLY,
        },
        {
          address: address('DwJbjRmAK7VDkKZ32aL9wnYBrRDHASCHpXSV1o9FEcYw'),
          role: AccountRole.READONLY,
        },
        {
          address: address('xGpiagpKBNxSkYiTMDZP6ko1uCWPn1k84iSJWP6Dnjk'),
          role: AccountRole.READONLY,
        },
        {
          address: address('5FjRN2EvjGmEjmcHcYafHncjrTajzdCWPUsu2RpdhXda'),
          role: AccountRole.READONLY,
        },
      ],
    };
    const provider = address('A4ahkivAG4NoZAE8Sy4qv8nn2DU9yoXRQcttuCeGtTJv');

    expect(
      await validateCnftCoreTransfer(
        instruction,
        address('6C8CgF1aGHRconBnqrXp4QrinccvK71Ehk5scbiyJnLX'),
        address('7bGr6GxLVhoNGiRaGp1zVxwf1SfR8VWXqHeRSYkv1ka9'),
        provider,
        provider,
        COLLECTION,
      ),
    ).toStrictEqual({
      tree: address('CCTREEA8hbsXNCf77tUEgbHaBFV9CmgfuQWfeNXHQ34h'),
      treeConfig: address('KUg3yscy8HrcRrzWkCjqkMSMcAW8DBqFonov4fDb7F8'),
      collection: address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac'),
    });
  });

  it.each([PROVIDER, USER])(
    'binds the leaf to the requested asset with network fee payer %s',
    async (feePayer) => {
      const { instruction, assetId, treeConfig } = await fixture(feePayer);

      expect(
        await validateCnftCoreTransfer(
          instruction,
          USER,
          assetId,
          PROVIDER,
          feePayer,
          COLLECTION,
        ),
      ).toStrictEqual({
        tree: TREE,
        treeConfig,
        collection: COLLECTION,
      });
    },
  );

  it.each([
    { assetDataHash: false, flags: false },
    { assetDataHash: true, flags: false },
    { assetDataHash: false, flags: true },
    { assetDataHash: true, flags: true },
  ])('accepts canonical Borsh options %o', async (options) => {
    const { instruction, assetId, treeConfig } = await fixture();

    expect(
      await validateCnftCoreTransfer(
        { ...instruction, data: transferData(options) },
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).toStrictEqual({
      tree: TREE,
      treeConfig,
      collection: COLLECTION,
    });
  });

  it('accepts an omitted leaf delegate (Bubblegum sentinel)', async () => {
    const { instruction, assetId, treeConfig } = await fixture();
    const transfer = replaceAccount(instruction, 4, {
      address: BUBBLEGUM_PROGRAM_ADDRESS,
      role: AccountRole.READONLY,
    });

    expect(
      await validateCnftCoreTransfer(
        transfer,
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).toStrictEqual({
      tree: TREE,
      treeConfig,
      collection: COLLECTION,
    });
  });

  it('accepts a complete canopy requiring no remaining proof accounts', async () => {
    const { instruction, assetId, treeConfig } = await fixture();

    expect(
      await validateCnftCoreTransfer(
        { ...instruction, accounts: instruction.accounts?.slice(0, 11) },
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).toStrictEqual({
      tree: TREE,
      treeConfig,
      collection: COLLECTION,
    });
  });

  it.each([
    ['recipient', 5],
    ['tree', 6],
    ['collection', 7],
  ] as const)('rejects a missing %s address', async (_name, index) => {
    const { instruction, assetId } = await fixture();
    // Exercise the helper's malformed-input guard, not a decoded wire transaction.
    const incomplete = replaceAccount(instruction, index, {
      address: undefined,
    });

    await expect(
      validateCnftCoreTransfer(
        incomplete,
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).rejects.toThrow('Missing Pack Partner compressed transfer accounts.');
  });

  it.each([0, 1, 2, 3, 4, 6, 8, 9, 10])(
    'rejects a substituted fixed account at index %i',
    async (index) => {
      const { instruction, assetId } = await fixture();

      await expect(
        validateCnftCoreTransfer(
          replaceAccount(instruction, index, { address: OTHER }),
          USER,
          assetId,
          PROVIDER,
          PROVIDER,
          COLLECTION,
        ),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it.each([
    [0, AccountRole.READONLY],
    [1, AccountRole.READONLY],
    [2, AccountRole.READONLY],
    [3, AccountRole.READONLY],
    [4, AccountRole.READONLY],
    [5, AccountRole.WRITABLE],
    [6, AccountRole.READONLY],
    [7, AccountRole.WRITABLE],
    [8, AccountRole.WRITABLE],
    [9, AccountRole.WRITABLE],
    [10, AccountRole.WRITABLE],
    [11, AccountRole.WRITABLE],
  ])('rejects a changed privilege at index %i', async (index, role) => {
    const { instruction, assetId } = await fixture();

    await expect(
      validateCnftCoreTransfer(
        replaceAccount(instruction, index, { role }),
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it.each([
    USER,
    PROVIDER,
    TREE,
    COLLECTION,
    BUBBLEGUM_PROGRAM_ADDRESS,
    SYSTEM_PROGRAM_ADDRESS,
    NOOP,
    COMPRESSION_PROGRAM_ADDRESS,
  ])(
    'rejects a recipient aliasing a critical account: %s',
    async (recipient) => {
      const { instruction, assetId } = await fixture();

      await expect(
        validateCnftCoreTransfer(
          replaceAccount(instruction, 5, { address: recipient }),
          USER,
          assetId,
          PROVIDER,
          PROVIDER,
          COLLECTION,
        ),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it('rejects a recipient aliasing the tree authority', async () => {
    const { instruction, assetId, treeConfig } = await fixture();

    await expect(
      validateCnftCoreTransfer(
        replaceAccount(instruction, 5, { address: treeConfig }),
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it.each([BUBBLEGUM_PROGRAM_ADDRESS, OTHER])(
    'rejects an omitted or unreviewed Core collection %s',
    async (collection) => {
      const { instruction, assetId } = await fixture();

      await expect(
        validateCnftCoreTransfer(
          replaceAccount(instruction, 7, { address: collection }),
          USER,
          assetId,
          PROVIDER,
          PROVIDER,
          COLLECTION,
        ),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it('rejects another requested asset ID', async () => {
    const { instruction } = await fixture();

    await expect(
      validateCnftCoreTransfer(
        instruction,
        USER,
        OTHER,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it('rejects another leaf nonce even in the same tree', async () => {
    const { instruction, assetId } = await fixture();

    await expect(
      validateCnftCoreTransfer(
        { ...instruction, data: transferData({ nonce: 43n }) },
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it('rejects an unapproved network fee payer', async () => {
    const { instruction, assetId } = await fixture();

    await expect(
      validateCnftCoreTransfer(
        instruction,
        USER,
        assetId,
        PROVIDER,
        OTHER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it('keeps the 6000-lamport protocol fee sponsored even when the user pays the network fee', async () => {
    const { instruction, assetId } = await fixture(USER);

    await expect(
      validateCnftCoreTransfer(
        replaceAccount(instruction, 1, { address: USER }),
        USER,
        assetId,
        PROVIDER,
        USER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it.each([0, 7, 11, 104, 105, 117, 119, 150, 152])(
    'rejects truncated or trailing data with length %i',
    async (length) => {
      const { instruction, assetId } = await fixture();
      const data = new Uint8Array(length);
      data.set(transferData().slice(0, length));

      await expect(
        validateCnftCoreTransfer(
          { ...instruction, data },
          USER,
          assetId,
          PROVIDER,
          PROVIDER,
          COLLECTION,
        ),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it.each([
    [0, 118],
    [104, 2],
    [105, 2],
  ])('rejects noncanonical instruction byte %i=%i', async (offset, value) => {
    const { instruction, assetId } = await fixture();
    const data = transferData();
    data[offset] = value;

    await expect(
      validateCnftCoreTransfer(
        { ...instruction, data },
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });

  it.each([1, 2, 4, 255])(
    'rejects frozen/nontransferable or unknown leaf flags %i',
    async (flags) => {
      const { instruction, assetId } = await fixture();
      const data = transferData({ flags: true });
      data[106] = flags;

      await expect(
        validateCnftCoreTransfer(
          { ...instruction, data },
          USER,
          assetId,
          PROVIDER,
          PROVIDER,
          COLLECTION,
        ),
      ).rejects.toThrow(/Pack Partner/u);
    },
  );

  it.each([
    { programAddress: OTHER },
    { data: undefined },
    { accounts: undefined },
    { accounts: [] },
  ])('rejects incomplete or unsupported instruction %o', async (changes) => {
    const { instruction, assetId } = await fixture();

    await expect(
      validateCnftCoreTransfer(
        { ...instruction, ...changes },
        USER,
        assetId,
        PROVIDER,
        PROVIDER,
        COLLECTION,
      ),
    ).rejects.toThrow(/Pack Partner/u);
  });
});
