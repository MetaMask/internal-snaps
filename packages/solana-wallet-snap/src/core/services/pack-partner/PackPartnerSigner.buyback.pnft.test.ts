import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Fixture helpers preserve their inferred shapes. */
/* eslint-disable id-denylist -- Solana RPC names its simulation error field `err`. */
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getMintEncoder,
  getTokenEncoder,
  getTransferInstruction,
} from '@solana-program/token';
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createKeyPairSignerFromPrivateKeyBytes,
  createTransactionMessage,
  getAddressEncoder,
  getBase64Decoder,
  getProgramDerivedAddress,
  partiallySignTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import type { Address, ReadonlyUint8Array } from '@solana/kit';

import { Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import { deriveSolanaKeypair } from '../../utils/deriveSolanaKeypair';
import * as DeriveSolanaKeypair from '../../utils/deriveSolanaKeypair';
import type { SolanaConnection } from '../connection';
import * as PackPartnerConstants from './constants';
import { getPackPartnerNetworkConfig } from './constants';
import { TOKEN_METADATA_PROGRAM_ADDRESS } from './nft-standards/programs';
import { PackPartnerSigner } from './PackPartnerSigner';

const PACK_PARTNER_USDC_MINT = getPackPartnerNetworkConfig(
  Network.Mainnet,
).usdcMint;
const PACK_PARTNER_MEMO_PROGRAM = address(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

const userSeed = new Uint8Array(32).fill(1);
const sponsorSeed = new Uint8Array(32).fill(2);
const nft = address('11111111111111111111111111111113');
const inventory = address('onePMfirJs2Rx3eixoPnjY6NHiaC74pkQ2k313K2Lxs');
const collection = address('CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf');
const other = address('11111111111111111111111111111114');
const rulesProgram = address('auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg');
const instructionsSysvar = address(
  'Sysvar1nstructions1111111111111111111111111',
);
const associatedTokenProgram = address(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);
const amount = 11_050_000n;

const response = (value: unknown) => ({
  send: vi.fn().mockResolvedValue(value),
});
const rpc = {
  getMultipleAccounts: vi.fn(),
  getFeeForMessage: vi.fn(),
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
};
const connection = {
  getRpc: vi.fn(() => rpc),
} as unknown as SolanaConnection;

const accountData = (
  owner: Address,
  bytes: ReadonlyUint8Array,
  lamports: bigint,
) => ({
  owner,
  executable: false,
  lamports,
  data: [getBase64Decoder().decode(bytes), 'base64'] as const,
});
const sol = (lamports: bigint) => ({
  owner: SYSTEM_PROGRAM_ADDRESS,
  executable: false,
  lamports,
  data: ['', 'base64'] as const,
});
const token = (mint: Address, owner: Address, balance: bigint) =>
  accountData(
    TOKEN_PROGRAM_ADDRESS,
    getTokenEncoder().encode({
      mint,
      owner,
      amount: balance,
      delegate: null,
      state: 1,
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
    }),
    2_039_280n,
  );
const metadata = (verified = 1) =>
  accountData(
    TOKEN_METADATA_PROGRAM_ADDRESS,
    new Uint8Array([
      4,
      ...getAddressEncoder().encode(other),
      ...getAddressEncoder().encode(nft),
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
      4, // Programmable non-fungible standard.
      1,
      verified, // Verified collection.
      ...getAddressEncoder().encode(collection),
    ]),
    1_000_000n,
  );
const mintAccount = (supply = 1n) =>
  accountData(
    TOKEN_PROGRAM_ADDRESS,
    getMintEncoder().encode({
      mintAuthority: null,
      supply,
      decimals: 0,
      isInitialized: true,
      freezeAuthority: null,
    }),
    1_000_000n,
  );

type AccountState =
  | ReturnType<typeof accountData>
  | ReturnType<typeof sol>
  | null;
type Snapshot = Map<string, AccountState>;
type PnftAddresses = {
  user: Address;
  sourceToken: Address;
  destinationToken: Address;
  sourceRecord: Address;
  destinationRecord: Address;
  metadataAddress: Address;
  edition: Address;
  userUsdc: Address;
  sponsorUsdc: Address;
};
type Mutation = (
  before: Snapshot,
  after: Snapshot,
  accounts: PnftAddresses,
) => void;

async function fixture(mutate?: Mutation) {
  const user = await createKeyPairSignerFromPrivateKeyBytes(userSeed);
  const sponsor = await createKeyPairSignerFromPrivateKeyBytes(sponsorSeed);
  expect(sponsor.address).toBe(
    PackPartnerConstants.getPackPartnerNetworkConfig(Network.Mainnet)
      .signers[0],
  );
  const [sourceToken] = await findAssociatedTokenPda({
    owner: user.address,
    mint: nft,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destinationToken] = await findAssociatedTokenPda({
    owner: inventory,
    mint: nft,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [userUsdc] = await findAssociatedTokenPda({
    owner: user.address,
    mint: PACK_PARTNER_USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [sponsorUsdc] = await findAssociatedTokenPda({
    owner: sponsor.address,
    mint: PACK_PARTNER_USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const metadataSeeds = [
    'metadata',
    getAddressEncoder().encode(TOKEN_METADATA_PROGRAM_ADDRESS),
    getAddressEncoder().encode(nft),
  ];
  const [metadataAddress] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: metadataSeeds,
  });
  const [edition] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [...metadataSeeds, 'edition'],
  });
  const [sourceRecord] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [
      ...metadataSeeds,
      'token_record',
      getAddressEncoder().encode(sourceToken),
    ],
  });
  const [destinationRecord] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [
      ...metadataSeeds,
      'token_record',
      getAddressEncoder().encode(destinationToken),
    ],
  });
  const pnftAddresses = {
    user: user.address,
    sourceToken,
    destinationToken,
    sourceRecord,
    destinationRecord,
    metadataAddress,
    edition,
    userUsdc,
    sponsorUsdc,
  };
  const pnftTransfer = {
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    data: new Uint8Array([49, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
    accounts: [
      { address: sourceToken, role: AccountRole.WRITABLE },
      { address: user.address, role: AccountRole.READONLY_SIGNER },
      { address: destinationToken, role: AccountRole.WRITABLE },
      { address: inventory, role: AccountRole.READONLY },
      { address: nft, role: AccountRole.READONLY },
      { address: metadataAddress, role: AccountRole.WRITABLE },
      { address: edition, role: AccountRole.READONLY },
      { address: sourceRecord, role: AccountRole.WRITABLE },
      { address: destinationRecord, role: AccountRole.WRITABLE },
      { address: user.address, role: AccountRole.READONLY_SIGNER },
      { address: sponsor.address, role: AccountRole.WRITABLE_SIGNER },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: instructionsSysvar, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: associatedTokenProgram, role: AccountRole.READONLY },
      { address: rulesProgram, role: AccountRole.READONLY },
      { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
  };
  const closeSource = {
    programAddress: TOKEN_PROGRAM_ADDRESS,
    data: new Uint8Array([9]),
    accounts: [
      { address: sourceToken, role: AccountRole.WRITABLE },
      { address: sponsor.address, role: AccountRole.WRITABLE_SIGNER },
      { address: user.address, role: AccountRole.READONLY_SIGNER },
    ],
  };
  const message = appendTransactionMessageInstructions(
    [
      pnftTransfer,
      closeSource,
      getTransferInstruction({
        source: sponsorUsdc,
        destination: userUsdc,
        authority: sponsor,
        amount,
      }),
      {
        programAddress: PACK_PARTNER_MEMO_PROGRAM,
        data: new Uint8Array([1]),
      },
    ],
    setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash('11111111111111111111111111111111'),
        lastValidBlockHeight: 100n,
      },
      setTransactionMessageFeePayer(
        sponsor.address,
        createTransactionMessage({ version: 'legacy' }),
      ),
    ),
  );
  const transaction = await partiallySignTransaction(
    [sponsor.keyPair],
    compileTransaction(message),
  );
  const account = {
    address: user.address,
    scopes: [Network.Mainnet],
    entropySource: 'test',
    derivationPath: "m/44'/501'/0'/0'",
  } as unknown as ExtendedKeyringAccount;
  vi.mocked(deriveSolanaKeypair).mockResolvedValue({
    privateKeyBytes: userSeed,
    publicKeyBytes: new Uint8Array(32),
  });

  const before: Snapshot = new Map([
    [user.address, sol(1_000_000n)],
    [sponsor.address, sol(5_000_000n)],
    [userUsdc, token(PACK_PARTNER_USDC_MINT, user.address, 1_000_000n)],
    [sponsorUsdc, token(PACK_PARTNER_USDC_MINT, sponsor.address, 50_000_000n)],
    [sourceToken, token(nft, user.address, 1n)],
    [destinationToken, token(nft, inventory, 0n)],
    [
      sourceRecord,
      accountData(
        TOKEN_METADATA_PROGRAM_ADDRESS,
        new Uint8Array([1]),
        1_000_000n,
      ),
    ],
    [metadataAddress, metadata()],
    [
      edition,
      accountData(
        TOKEN_METADATA_PROGRAM_ADDRESS,
        new Uint8Array([6]),
        1_000_000n,
      ),
    ],
    [nft, mintAccount()],
  ]);
  const after: Snapshot = new Map(before);
  after.set(
    userUsdc,
    token(PACK_PARTNER_USDC_MINT, user.address, 1_000_000n + amount),
  );
  after.set(
    sponsorUsdc,
    token(PACK_PARTNER_USDC_MINT, sponsor.address, 50_000_000n - amount),
  );
  after.set(sourceToken, null);
  after.set(destinationToken, token(nft, inventory, 1n));
  after.set(sourceRecord, null);
  after.set(
    destinationRecord,
    accountData(
      TOKEN_METADATA_PROGRAM_ADDRESS,
      new Uint8Array([1]),
      1_000_000n,
    ),
  );
  mutate?.(before, after, pnftAddresses);

  let requestedAddresses: string[] = [];
  rpc.getMultipleAccounts.mockImplementation((addresses: string[]) => {
    requestedAddresses = addresses;
    return response({
      context: { slot: 1n },
      value: addresses.map((item) => before.get(item) ?? null),
    });
  });
  rpc.getFeeForMessage.mockReturnValue(
    response({ context: { slot: 1n }, value: 12_500n }),
  );
  rpc.simulateTransaction.mockImplementation(() =>
    response({
      context: { slot: 1n },
      value: {
        err: null,
        accounts: requestedAddresses.map((item) => after.get(item) ?? null),
      },
    }),
  );
  return {
    account,
    wire: fromTransactionToBase64String(transaction),
    pnftAddresses,
  };
}

function getSnapshotAccount(
  snapshot: Snapshot,
  account: Address,
): AccountState {
  return snapshot.get(account) ?? null;
}

describe('PackPartnerSigner programmable NFT buyback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(DeriveSolanaKeypair, 'deriveSolanaKeypair');
    const getNetworkConfig = PackPartnerConstants.getPackPartnerNetworkConfig;
    vi.spyOn(
      PackPartnerConstants,
      'getPackPartnerNetworkConfig',
    ).mockImplementation((scope) => ({
      ...getNetworkConfig(scope),
      signers: [address('9hSR6S7WPtxmTojgo6GG3k4yDPecgJY292j7xrsUGWBu')],
    }));
  });

  it('signs after the NFT moves to inventory and the user receives exact USDC', async () => {
    const { account, wire } = await fixture();

    const result = await new PackPartnerSigner(connection).signBuyback(
      account,
      wire,
      {
        amount: amount.toString(),
        assetAddress: nft,
        expectedStandard: 'pnft',
      },
      Network.Mainnet,
    );

    expect(result.signature).toStrictEqual(expect.any(String));
    expect(result.signedTransaction).toStrictEqual(expect.any(String));
    expect(deriveSolanaKeypair).toHaveBeenCalledTimes(1);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'source NFT remains in the user token account',
      (before: Snapshot, after: Snapshot, accounts: PnftAddresses) =>
        after.set(
          accounts.sourceToken,
          getSnapshotAccount(before, accounts.sourceToken),
        ),
    ],
    [
      'destination NFT balance does not increase',
      (_before: Snapshot, after: Snapshot, accounts: PnftAddresses) =>
        after.set(accounts.destinationToken, token(nft, inventory, 0n)),
    ],
    [
      'user receives one micro-USDC too little',
      (_before: Snapshot, after: Snapshot, accounts: PnftAddresses) =>
        after.set(
          accounts.userUsdc,
          token(
            PACK_PARTNER_USDC_MINT,
            accounts.user,
            1_000_000n + amount - 1n,
          ),
        ),
    ],
    [
      'metadata changes during execution',
      (_before: Snapshot, after: Snapshot, accounts: PnftAddresses) =>
        after.set(
          accounts.metadataAddress,
          accountData(
            TOKEN_METADATA_PROGRAM_ADDRESS,
            new Uint8Array([4, 1]),
            1_000_000n,
          ),
        ),
    ],
    [
      'metadata collection is not verified',
      (before: Snapshot, after: Snapshot, accounts: PnftAddresses) => {
        before.set(accounts.metadataAddress, metadata(0));
        after.set(accounts.metadataAddress, metadata(0));
      },
    ],
    [
      'source token record remains open',
      (before: Snapshot, after: Snapshot, accounts: PnftAddresses) =>
        after.set(
          accounts.sourceRecord,
          getSnapshotAccount(before, accounts.sourceRecord),
        ),
    ],
    [
      'destination token record is absent',
      (_before: Snapshot, after: Snapshot, accounts: PnftAddresses) =>
        after.set(accounts.destinationRecord, null),
    ],
    [
      'destination token record has the wrong program owner',
      (_before: Snapshot, after: Snapshot, accounts: PnftAddresses) =>
        after.set(
          accounts.destinationRecord,
          accountData(TOKEN_PROGRAM_ADDRESS, new Uint8Array([1]), 1_000_000n),
        ),
    ],
    [
      'NFT mint changes during execution',
      (_before: Snapshot, after: Snapshot) =>
        after.set(
          nft,
          accountData(TOKEN_PROGRAM_ADDRESS, new Uint8Array(82), 1_000_000n),
        ),
    ],
    [
      'NFT mint has more than one token',
      (before: Snapshot, after: Snapshot) => {
        before.set(nft, mintAccount(2n));
        after.set(nft, mintAccount(2n));
      },
    ],
  ] as const)('rejects when %s', async (_name, mutate) => {
    const { account, wire } = await fixture(mutate);

    await expect(
      new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: amount.toString(),
          assetAddress: nft,
          expectedStandard: 'pnft',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each(['core', 'nft', 'cnft-core', 'unknown'] as const)(
    'rejects a pNFT transfer labelled %s',
    async (expectedStandard) => {
      const { account, wire } = await fixture();

      await expect(
        new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: amount.toString(),
            assetAddress: nft,
            expectedStandard,
          },
          Network.Mainnet,
        ),
      ).rejects.toThrow(/Pack Partner/u);
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it('rejects a different NFT selected for the same presigned transaction', async () => {
    const { account, wire } = await fixture();

    await expect(
      new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: amount.toString(),
          assetAddress: other,
          expectedStandard: 'pnft',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });
});
