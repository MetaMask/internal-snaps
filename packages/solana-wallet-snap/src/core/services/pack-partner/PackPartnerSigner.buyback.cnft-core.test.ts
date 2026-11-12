import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Test fixtures preserve their inferred shapes. */
/* eslint-disable id-denylist -- Solana RPC names its simulation error field `err`. */
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getTokenEncoder,
  getTransferCheckedInstruction,
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
  getU64Encoder,
  partiallySignTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import type { Address, ReadonlyUint8Array } from '@solana/kit';

import { Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import * as DeriveSolanaKeypair from '../../utils/deriveSolanaKeypair';
import type { SolanaConnection } from '../connection';
import * as Policy from './constants';
import { CORE_PROGRAM_ADDRESS } from './nft-standards/programs';
import { PackPartnerSigner } from './PackPartnerSigner';

const BUBBLEGUM = address('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY');
const COMPRESSION = address('mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW');
const NOOP = address('mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3');
const MEMO = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const tree = address('11111111111111111111111111111113');
const collection = address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac');
const recipient = address('Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu');
const proof = address('11111111111111111111111111111114');
const userSeed = new Uint8Array(32).fill(1);
const sponsorSeed = new Uint8Array(32).fill(2);
const refund = 11_050_000n;
const defaultFee = 12_500n;
const transferFee = 6_000n;
const response = (value: unknown) => ({
  send: vi.fn().mockResolvedValue(value),
});
const rpc = {
  getMultipleAccounts: vi.fn(),
  getAccountInfo: vi.fn(),
  getFeeForMessage: vi.fn(),
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
};
const connection = { getRpc: vi.fn(() => rpc) } as unknown as SolanaConnection;
const chainAccount = (
  owner: Address,
  bytes: ReadonlyUint8Array,
  lamports = 2_000_000n,
) => ({
  owner,
  executable: false,
  lamports,
  data: [getBase64Decoder().decode(bytes), 'base64'] as const,
});
const sol = (lamports: bigint) =>
  chainAccount(SYSTEM_PROGRAM_ADDRESS, new Uint8Array(), lamports);
const token = (usdcMint: Address, owner: Address, amount: bigint) =>
  chainAccount(
    TOKEN_PROGRAM_ADDRESS,
    getTokenEncoder().encode({
      mint: usdcMint,
      owner,
      amount,
      delegate: null,
      state: 1,
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
    }),
  );
type Snapshot = Map<Address, ReturnType<typeof chainAccount> | null>;

async function fixture({
  userPays = false,
  fee = defaultFee,
  userHasSol = true,
  badAsset = false,
  duplicateTransfer = false,
  payment = refund,
  expectedAmount = refund,
  mutation,
  network = Network.Mainnet,
  transactionCollection = collection,
}: {
  userPays?: boolean;
  fee?: bigint;
  userHasSol?: boolean;
  badAsset?: boolean;
  duplicateTransfer?: boolean;
  payment?: bigint;
  expectedAmount?: bigint;
  mutation?: (
    before: Snapshot,
    after: Snapshot,
    addresses: {
      user: Address;
      sponsor: Address;
      treeConfig: Address;
      userUsdc: Address;
    },
  ) => void;
  network?: Network;
  transactionCollection?: Address;
} = {}) {
  const { usdcMint } = Policy.getPackPartnerNetworkConfig(network);
  const user = await createKeyPairSignerFromPrivateKeyBytes(userSeed);
  const sponsor = await createKeyPairSignerFromPrivateKeyBytes(sponsorSeed);
  const getConfig = Policy.getPackPartnerNetworkConfig;
  vi.spyOn(Policy, 'getPackPartnerNetworkConfig').mockImplementation(
    (scope) => ({ ...getConfig(scope), signers: [sponsor.address] }),
  );
  const [treeConfig] = await getProgramDerivedAddress({
    programAddress: BUBBLEGUM,
    seeds: [getAddressEncoder().encode(tree)],
  });
  const [assetId] = await getProgramDerivedAddress({
    programAddress: BUBBLEGUM,
    seeds: [
      new TextEncoder().encode('asset'),
      getAddressEncoder().encode(tree),
      getU64Encoder().encode(7n),
    ],
  });
  const [userUsdc] = await findAssociatedTokenPda({
    owner: user.address,
    mint: usdcMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [providerUsdc] = await findAssociatedTokenPda({
    owner: sponsor.address,
    mint: usdcMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  // Canonical Bubblegum V2 wire layout. Proof execution itself is the RPC simulation boundary.
  const transfer = {
    programAddress: BUBBLEGUM,
    data: new Uint8Array([
      119,
      40,
      6,
      235,
      234,
      221,
      248,
      49,
      ...new Uint8Array(96).fill(1),
      0,
      0,
      ...getU64Encoder().encode(7n),
      7,
      0,
      0,
      0,
    ]),
    accounts: [
      { address: treeConfig, role: AccountRole.WRITABLE },
      { address: sponsor.address, role: AccountRole.WRITABLE_SIGNER },
      { address: user.address, role: AccountRole.READONLY_SIGNER },
      { address: user.address, role: AccountRole.READONLY_SIGNER },
      { address: user.address, role: AccountRole.READONLY_SIGNER },
      { address: recipient, role: AccountRole.READONLY },
      { address: tree, role: AccountRole.WRITABLE },
      { address: transactionCollection, role: AccountRole.READONLY },
      { address: NOOP, role: AccountRole.READONLY },
      { address: COMPRESSION, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: proof, role: AccountRole.READONLY },
    ],
  };
  const message = appendTransactionMessageInstructions(
    [
      transfer,
      ...(duplicateTransfer ? [transfer] : []),
      getTransferCheckedInstruction({
        source: providerUsdc,
        mint: usdcMint,
        destination: userUsdc,
        authority: sponsor.address,
        amount: payment,
        decimals: 6,
      }),
      {
        programAddress: MEMO,
        data: new TextEncoder().encode('cc-fixture:buyback'),
      },
    ],
    setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash('11111111111111111111111111111111'),
        lastValidBlockHeight: 100n,
      },
      setTransactionMessageFeePayer(
        userPays ? user.address : sponsor.address,
        createTransactionMessage({ version: 'legacy' }),
      ),
    ),
  );
  const wire = fromTransactionToBase64String(
    await partiallySignTransaction(
      [sponsor.keyPair],
      compileTransaction(message),
    ),
  );
  const before: Snapshot = new Map([
    [user.address, userHasSol ? sol(1_000_000n) : null],
    [sponsor.address, sol(5_000_000n)],
    [userUsdc, token(usdcMint, user.address, 0n)],
    [providerUsdc, token(usdcMint, sponsor.address, 50_000_000n)],
    [tree, chainAccount(COMPRESSION, new Uint8Array(64).fill(1))],
    [treeConfig, chainAccount(BUBBLEGUM, new Uint8Array(96).fill(2))],
    [
      transactionCollection,
      chainAccount(CORE_PROGRAM_ADDRESS, new Uint8Array(64).fill(3)),
    ],
  ]);
  const after = new Map(before);
  after.set(
    user.address,
    userHasSol ? sol(1_000_000n - (userPays ? fee : 0n)) : null,
  );
  after.set(
    sponsor.address,
    sol(5_000_000n - transferFee - (userPays ? 0n : fee)),
  );
  after.set(userUsdc, token(usdcMint, user.address, refund));
  after.set(
    providerUsdc,
    token(usdcMint, sponsor.address, 50_000_000n - refund),
  );
  after.set(tree, chainAccount(COMPRESSION, new Uint8Array(64).fill(4)));
  after.set(
    treeConfig,
    chainAccount(
      BUBBLEGUM,
      new Uint8Array(96).fill(2),
      2_000_000n + transferFee,
    ),
  );
  mutation?.(before, after, {
    user: user.address,
    sponsor: sponsor.address,
    treeConfig,
    userUsdc,
  });
  rpc.getMultipleAccounts.mockImplementation((addresses: Address[]) =>
    response({
      context: { slot: 10n },
      value: addresses.map((key) => before.get(key) ?? null),
    }),
  );
  rpc.getAccountInfo.mockReturnValue(
    response({
      context: { slot: 10n },
      value: { ...before.get(tree), data: ['', 'base64'] },
    }),
  );
  rpc.getFeeForMessage.mockReturnValue(response({ value: fee }));
  rpc.simulateTransaction.mockImplementation(
    (_wire: string, options: { accounts: { addresses: Address[] } }) =>
      response({
        value: {
          err: null,
          accounts: options.accounts.addresses.map(
            (key) => after.get(key) ?? null,
          ),
        },
      }),
  );
  vi.spyOn(DeriveSolanaKeypair, 'deriveSolanaKeypair').mockResolvedValue({
    privateKeyBytes: userSeed,
    publicKeyBytes: Uint8Array.from(getAddressEncoder().encode(user.address)),
  });
  const account = {
    address: user.address,
    scopes: [network],
    entropySource: 'fixture',
    derivationPath: ['m', "44'", "501'", "0'", "0'"],
  } as unknown as ExtendedKeyringAccount;
  const sign = () =>
    new PackPartnerSigner(connection).signBuyback(
      account,
      wire,
      {
        amount: String(expectedAmount),
        assetAddress: badAsset ? proof : assetId,
        expectedStandard: 'cnft-core',
      },
      network,
    );
  return { sign, user, before, after, treeConfig, userUsdc };
}

describe('Pack Partner Bubblegum V2 buyback signing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });
  it.each([false, true])(
    'signs a verified exact refund (user pays network fees: %s)',
    async (userPays) => {
      const scenario = await fixture({ userPays });
      expect(await scenario.sign()).toStrictEqual({
        signedTransaction: expect.any(String),
        signature: expect.any(String),
      });
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );
  it('supports a sponsored wallet with no SOL account', async () => {
    const scenario = await fixture({ userHasSol: false });
    expect(await scenario.sign()).toHaveProperty('signedTransaction');
  });
  it.each([
    {
      options: { badAsset: true },
      error: 'Unexpected Pack Partner compressed asset or recipient.',
    },
    {
      options: { duplicateTransfer: true },
      error: 'unexpected compressed NFT transfer',
    },
    {
      options: { payment: refund - 1n },
      error: 'USDC transfer does not match confirmed intent',
    },
    {
      options: { expectedAmount: refund + 1n },
      error: 'USDC transfer does not match confirmed intent',
    },
  ])(
    'rejects intent mismatch before deriving a key (case %#)',
    async ({ options, error }) => {
      const scenario = await fixture(options);
      await expect(scenario.sign()).rejects.toThrow(error);
      expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );
  it('rejects a failed Merkle proof simulation without deriving a key', async () => {
    const scenario = await fixture();
    rpc.simulateTransaction.mockReturnValue(
      response({
        value: { err: { InstructionError: [0, 'InvalidProof'] }, accounts: [] },
      }),
    );
    await expect(scenario.sign()).rejects.toThrow(
      'failed or incomplete simulation',
    );
    expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
  });
  it('rejects protocol fees or other SOL movements charged to the user', async () => {
    const scenario = await fixture({
      mutation: (_before, after, { user }) => {
        after.set(user, sol(1_000_000n - transferFee));
      },
    });
    await expect(scenario.sign()).rejects.toThrow(
      'unexpected user SOL movement',
    );
    expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
  });
  it('supports the independently configured devnet mint', async () => {
    const scenario = await fixture({ network: Network.Devnet });
    expect(await scenario.sign()).toHaveProperty('signedTransaction');
    expect(connection.getRpc).toHaveBeenCalledWith(Network.Devnet);
  });

  it('uses the configured devnet collection instead of a mainnet validator constant', async () => {
    const devnetCollection = address('11111111111111111111111111111116');
    const scenario = await fixture({
      network: Network.Devnet,
      transactionCollection: devnetCollection,
    });
    const configured = Policy.getPackPartnerNetworkConfig(Network.Devnet);
    vi.mocked(Policy.getPackPartnerNetworkConfig).mockReturnValue({
      ...configured,
      buyback: { 'cnft-core': { collection: devnetCollection } },
    });

    expect(await scenario.sign()).toHaveProperty('signedTransaction');
    expect(connection.getRpc).toHaveBeenCalledWith(Network.Devnet);
    expect(DeriveSolanaKeypair.deriveSolanaKeypair).toHaveBeenCalledTimes(1);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects the mainnet collection when devnet config requires another collection', async () => {
    const scenario = await fixture({ network: Network.Devnet });
    const configured = Policy.getPackPartnerNetworkConfig(Network.Devnet);
    vi.mocked(Policy.getPackPartnerNetworkConfig).mockReturnValue({
      ...configured,
      buyback: {
        'cnft-core': {
          collection: address('11111111111111111111111111111116'),
        },
      },
    });

    await expect(scenario.sign()).rejects.toThrow(
      'Unexpected Pack Partner compressed asset or recipient.',
    );
    expect(rpc.getMultipleAccounts).not.toHaveBeenCalled();
    expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('never downloads the full Merkle tree account', async () => {
    const scenario = await fixture();
    await scenario.sign();
    expect(rpc.getMultipleAccounts).toHaveBeenCalledWith(
      expect.not.arrayContaining([tree]),
      expect.anything(),
    );
    expect(rpc.getAccountInfo).toHaveBeenCalledWith(tree, {
      encoding: 'base64',
      dataSlice: { offset: 0, length: 0 },
      commitment: 'confirmed',
      minContextSlot: 10n,
    });
    expect(rpc.simulateTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        accounts: {
          encoding: 'base64',
          addresses: expect.not.arrayContaining([tree]),
        },
      }),
    );
  });

  it.each([
    null,
    { owner: CORE_PROGRAM_ADDRESS, executable: false },
    { owner: COMPRESSION, executable: true },
  ])(
    'rejects an invalid compression tree before signing (%#)',
    async (value) => {
      const scenario = await fixture();
      rpc.getAccountInfo.mockReturnValue(
        response({ context: { slot: 10n }, value }),
      );
      await expect(scenario.sign()).rejects.toThrow(
        'invalid compressed NFT tree',
      );
      expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'includes the fixed protocol fee in the fee cap (user network payer: %s)',
    async (userPays) => {
      const scenario = await fixture({
        userPays,
        fee: Policy.PACK_PARTNER_MAX_FEE - transferFee,
      });
      expect(await scenario.sign()).toHaveProperty('signedTransaction');
    },
  );

  it.each([false, true])(
    'rejects total fees above the cap (user network payer: %s)',
    async (userPays) => {
      const scenario = await fixture({
        userPays,
        fee: Policy.PACK_PARTNER_MAX_FEE - transferFee + 1n,
      });
      await expect(scenario.sign()).rejects.toThrow('total fee exceeds cap');
      expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it('tolerates independent fee collection from the shared tree configuration', async () => {
    const scenario = await fixture({
      mutation: (_before, after, { treeConfig }) => {
        after.set(
          treeConfig,
          chainAccount(BUBBLEGUM, new Uint8Array(96).fill(2), 1_000_000n),
        );
      },
    });
    expect(await scenario.sign()).toHaveProperty('signedTransaction');
  });

  it.each(['owner', 'data', 'executable', 'missing'] as const)(
    'rejects an unexpected tree configuration %s',
    async (field) => {
      const changes = {
        owner: chainAccount(CORE_PROGRAM_ADDRESS, new Uint8Array(96).fill(2)),
        data: chainAccount(BUBBLEGUM, new Uint8Array(96).fill(5)),
        executable: {
          ...chainAccount(BUBBLEGUM, new Uint8Array(96).fill(2)),
          executable: true,
        },
        missing: null,
      };
      const scenario = await fixture({
        mutation: (_before, after, { treeConfig }) => {
          after.set(treeConfig, changes[field]);
        },
      });
      await expect(scenario.sign()).rejects.toThrow(
        'unexpected compressed NFT tree configuration change',
      );
      expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it('rejects a collection change despite successful simulation', async () => {
    const scenario = await fixture({
      mutation: (_before, after) => {
        after.set(
          collection,
          chainAccount(CORE_PROGRAM_ADDRESS, new Uint8Array(64).fill(8)),
        );
      },
    });
    await expect(scenario.sign()).rejects.toThrow(
      'unexpected compressed NFT collection change',
    );
    expect(DeriveSolanaKeypair.deriveSolanaKeypair).not.toHaveBeenCalled();
  });
});
