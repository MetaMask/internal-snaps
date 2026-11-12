import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Fixture helpers preserve their inferred shapes. */
/* eslint-disable id-denylist -- Solana RPC names its simulation error field `err`. */
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
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
  getStructEncoder,
  getU8Encoder,
  partiallySignTransaction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import type { Address } from '@solana/kit';

import { Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import { deriveSolanaKeypair } from '../../utils/deriveSolanaKeypair';
import * as DeriveSolanaKeypair from '../../utils/deriveSolanaKeypair';
import type { SolanaConnection } from '../connection';
import * as PackPartnerConstants from './constants';
import { PACK_PARTNER_MAX_FEE, getPackPartnerNetworkConfig } from './constants';
import { CORE_PROGRAM_ADDRESS } from './nft-standards/programs';
import { PackPartnerSigner } from './PackPartnerSigner';

const userSeed = new Uint8Array(32).fill(1);
const sponsorSeed = new Uint8Array(32).fill(2);
const rotatedSponsorSeed = new Uint8Array(32).fill(3);
const { usdcMint } = getPackPartnerNetworkConfig(Network.Mainnet);
const memoProgram = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
// Test-only second allowlisted program: production remains pinned to reviewed programs.
const rotatedMemoProgram = address(
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
);
const nft = address('11111111111111111111111111111113');
const collection = address('CCryptUfeFSZ3Fgc9FLeKrhLVAP67FSqi1GuVoj9CRac');
const inventory = address('Low6UekJP3QrFVMfNRTL8CPK2SiGFhvp57sgF2pkmVu');
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
const sol = (lamports: bigint) => ({
  lamports,
  owner: SYSTEM_PROGRAM_ADDRESS,
  executable: false,
  data: ['', 'base64'] as const,
});
const coreEncoder = getStructEncoder([
  ['key', getU8Encoder()],
  ['owner', getAddressEncoder()],
  ['updateAuthority', getU8Encoder()],
  ['collection', getAddressEncoder()],
]);
const core = (owner: ReturnType<typeof address>) => ({
  lamports: 2_000_000n,
  owner: CORE_PROGRAM_ADDRESS,
  executable: false,
  data: [
    getBase64Decoder().decode(
      coreEncoder.encode({ key: 1, owner, updateAuthority: 2, collection }),
    ),
    'base64',
  ] as const,
});
const token = (owner: ReturnType<typeof address>, amount: bigint) => ({
  lamports: 2_039_280n,
  owner: TOKEN_PROGRAM_ADDRESS,
  executable: false,
  data: [
    getBase64Decoder().decode(
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
    ),
    'base64',
  ] as const,
});

describe('PackPartnerSigner Core NFT buyback', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(DeriveSolanaKeypair, 'deriveSolanaKeypair');
    const trustedSponsors = await Promise.all(
      [sponsorSeed, rotatedSponsorSeed].map((seed) =>
        createKeyPairSignerFromPrivateKeyBytes(seed),
      ),
    );
    const getNetworkConfig = PackPartnerConstants.getPackPartnerNetworkConfig;
    vi.spyOn(
      PackPartnerConstants,
      'getPackPartnerNetworkConfig',
    ).mockImplementation((scope) => ({
      ...getNetworkConfig(scope),
      signers: trustedSponsors.map(
        ({ address: sponsorAddress }) => sponsorAddress,
      ),
      memoPrograms: [memoProgram, rotatedMemoProgram],
    }));
  });

  async function fixture({
    expectedNft = nft,
    amount = 11_050_000n,
    received = amount,
    userPays = false,
    validCollection = true,
    missingUserAccount = false,
    userLamports = 1_000_000n,
    fee = 12_500n,
    extraUserSpend = 0n,
    sponsorKeySeed = sponsorSeed,
    transactionMemoProgram = memoProgram,
    paymentOwner,
  }: {
    expectedNft?: Address;
    amount?: bigint;
    received?: bigint;
    userPays?: boolean;
    validCollection?: boolean;
    missingUserAccount?: boolean;
    userLamports?: bigint;
    fee?: bigint;
    extraUserSpend?: bigint;
    sponsorKeySeed?: Uint8Array;
    transactionMemoProgram?: Address;
    paymentOwner?: Address;
  } = {}) {
    const user = await createKeyPairSignerFromPrivateKeyBytes(userSeed);
    const sponsor =
      await createKeyPairSignerFromPrivateKeyBytes(sponsorKeySeed);
    const [userUsdc] = await findAssociatedTokenPda({
      owner: user.address,
      mint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [sponsorUsdc] = await findAssociatedTokenPda({
      owner: paymentOwner ?? sponsor.address,
      mint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const coreTransfer = {
      programAddress: CORE_PROGRAM_ADDRESS,
      data: new Uint8Array([14, 0]),
      accounts: [
        { address: nft, role: AccountRole.WRITABLE },
        {
          address: validCollection
            ? collection
            : address('11111111111111111111111111111114'),
          role: AccountRole.READONLY,
        },
        { address: sponsor.address, role: AccountRole.WRITABLE_SIGNER },
        { address: user.address, role: AccountRole.READONLY_SIGNER },
        { address: inventory, role: AccountRole.READONLY },
        { address: CORE_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        { address: CORE_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      ],
    };
    const createAta = {
      programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
      data: new Uint8Array([1]),
      accounts: [
        { address: sponsor.address, role: AccountRole.WRITABLE_SIGNER },
        { address: userUsdc, role: AccountRole.WRITABLE },
        { address: user.address, role: AccountRole.READONLY_SIGNER },
        { address: usdcMint, role: AccountRole.READONLY },
        { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      ],
    };
    const message = appendTransactionMessageInstructions(
      [
        coreTransfer,
        createAta,
        getTransferCheckedInstruction({
          source: sponsorUsdc,
          mint: usdcMint,
          destination: userUsdc,
          authority: sponsor.address,
          amount,
          decimals: 6,
        }),
        {
          programAddress: transactionMemoProgram,
          data: new Uint8Array([1]),
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
    const transaction = await partiallySignTransaction(
      [sponsor.keyPair],
      compileTransaction(message),
    );
    const account = {
      address: user.address,
      scopes: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      entropySource: 'test',
      derivationPath: "m/44'/501'/0'/0'",
    } as unknown as ExtendedKeyringAccount;
    vi.mocked(deriveSolanaKeypair).mockResolvedValue({
      privateKeyBytes: userSeed,
      publicKeyBytes: new Uint8Array(32),
    });
    const before = new Map<
      string,
      | ReturnType<typeof sol>
      | ReturnType<typeof token>
      | ReturnType<typeof core>
      | null
    >([
      [user.address, missingUserAccount ? null : sol(userLamports)],
      [sponsor.address, sol(5_000_000n)],
      [sponsorUsdc, token(sponsor.address, 50_000_000n)],
      [nft, core(user.address)],
    ]);
    let addresses: string[] = [];
    rpc.getMultipleAccounts.mockImplementation((items: string[]) => {
      addresses = items;
      return response({
        context: { slot: 1n },
        value: items.map((a) => before.get(a) ?? null),
      });
    });
    rpc.getFeeForMessage.mockReturnValue(
      response({ context: { slot: 1n }, value: fee }),
    );
    const simulatedAccount = (accountAddress: string) => {
      if (accountAddress === userUsdc) {
        return token(user.address, received);
      }
      if (accountAddress === sponsorUsdc) {
        return token(sponsor.address, 50_000_000n - amount);
      }
      if (accountAddress === nft) {
        return core(inventory);
      }
      if (accountAddress === sponsor.address) {
        return sol(5_000_000n - (userPays ? 0n : fee) - 2_039_280n);
      }
      if (accountAddress === user.address) {
        if (missingUserAccount) {
          return null;
        }
        return sol(userLamports - (userPays ? fee : 0n) - extraUserSpend);
      }
      return before.get(accountAddress) ?? null;
    };
    rpc.simulateTransaction.mockImplementation(() =>
      response({
        context: { slot: 1n },
        value: { err: null, accounts: addresses.map(simulatedAccount) },
      }),
    );
    return {
      account,
      wire: fromTransactionToBase64String(transaction),
      expectedNft,
    };
  }

  it.each([{ missingUserAccount: true }, { userLamports: 0n }])(
    'signs a sponsored buyback without SOL: %o',
    async (options) => {
      const { account, wire, expectedNft } = await fixture(options);

      const result = await new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: '11050000',
          assetAddress: expectedNft,
          expectedStandard: 'core',
        },
        Network.Mainnet,
      );

      expect(result.signedTransaction).toStrictEqual(expect.any(String));
      expect(deriveSolanaKeypair).toHaveBeenCalledTimes(1);
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'signs only after NFT ownership moves and the user receives exact USDC (user pays: %s)',
    async (userPays) => {
      const { account, wire, expectedNft } = await fixture({ userPays });
      const result = await new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: '11050000',
          assetAddress: expectedNft,
          expectedStandard: 'core',
        },
        Network.Mainnet,
      );
      expect(result.signature).toStrictEqual(expect.any(String));
      expect(result.signedTransaction).toStrictEqual(expect.any(String));
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'another NFT',
      { expectedNft: address('11111111111111111111111111111115') },
    ],
    ['an untrusted collection', { validCollection: false }],
    ['less USDC than promised', { received: 11_049_999n }],
  ])('rejects %s before signing', async (_name, options) => {
    const { account, wire, expectedNft } = await fixture(options);
    await expect(
      new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: '11050000',
          assetAddress: expectedNft,
          expectedStandard: 'core',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each([null, 0n, -1n])(
    'rejects unavailable or invalid network fees: %s',
    async (fee) => {
      const { account, wire, expectedNft } = await fixture();
      rpc.getFeeForMessage.mockReturnValue(
        response({ context: { slot: 1n }, value: fee }),
      );

      await expect(
        new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: '11050000',
            assetAddress: expectedNft,
            expectedStandard: 'core',
          },
          Network.Mainnet,
        ),
      ).rejects.toThrow(/fee unavailable or blockhash expired/u);
      expect(rpc.simulateTransaction).not.toHaveBeenCalled();
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'accepts the exact network fee cap (user pays: %s)',
    async (userPays) => {
      const { account, wire, expectedNft } = await fixture({
        userPays,
        fee: PACK_PARTNER_MAX_FEE,
      });

      expect(
        await new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: '11050000',
            assetAddress: expectedNft,
            expectedStandard: 'core',
          },
          Network.Mainnet,
        ),
      ).toMatchObject({ signedTransaction: expect.any(String) });
      expect(deriveSolanaKeypair).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'rejects network fees above the cap (user pays: %s)',
    async (userPays) => {
      const { account, wire, expectedNft } = await fixture({
        userPays,
        fee: PACK_PARTNER_MAX_FEE + 1n,
      });

      await expect(
        new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: '11050000',
            assetAddress: expectedNft,
            expectedStandard: 'core',
          },
          Network.Mainnet,
        ),
      ).rejects.toThrow(/fee exceeds cap/u);
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'rejects unexpected user SOL spending (user pays: %s)',
    async (userPays) => {
      const { account, wire, expectedNft } = await fixture({
        userPays,
        extraUserSpend: 1n,
      });

      await expect(
        new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: '11050000',
            assetAddress: expectedNft,
            expectedStandard: 'core',
          },
          Network.Mainnet,
        ),
      ).rejects.toThrow(/unexpected user SOL/u);
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it('rejects a user-paid simulation that does not debit the exact fee', async () => {
    const { account, wire, expectedNft } = await fixture({
      userPays: true,
      extraUserSpend: -1n,
    });

    await expect(
      new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: '11050000',
          assetAddress: expectedNft,
          expectedStandard: 'core',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/unexpected user SOL/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects user-paid fees when the user SOL account is absent', async () => {
    const { account, wire, expectedNft } = await fixture({
      userPays: true,
      missingUserAccount: true,
    });

    await expect(
      new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: '11050000',
          assetAddress: expectedNft,
          expectedStandard: 'core',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/invalid signer account/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each([sponsorSeed, rotatedSponsorSeed])(
    'accepts each reviewed sponsor during signer rotation',
    async (sponsorKeySeed) => {
      const { account, wire, expectedNft } = await fixture({ sponsorKeySeed });

      expect(
        await new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: '11050000',
            assetAddress: expectedNft,
            expectedStandard: 'core',
          },
          Network.Mainnet,
        ),
      ).toMatchObject({ signedTransaction: expect.any(String) });
    },
  );

  it.each([memoProgram, rotatedMemoProgram])(
    'accepts each independently reviewed memo program: %s',
    async (transactionMemoProgram) => {
      const { account, wire, expectedNft } = await fixture({
        transactionMemoProgram,
      });

      expect(
        await new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: '11050000',
            assetAddress: expectedNft,
            expectedStandard: 'core',
          },
          Network.Mainnet,
        ),
      ).toMatchObject({ signedTransaction: expect.any(String) });
    },
  );

  it.each([
    ['an untrusted presigner', { sponsorKeySeed: new Uint8Array(32).fill(4) }],
    [
      'an untrusted memo program',
      { transactionMemoProgram: address('11111111111111111111111111111112') },
    ],
  ])('rejects %s before accessing the signing key', async (_name, options) => {
    const { account, wire, expectedNft } = await fixture(options);

    await expect(
      new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: '11050000',
          assetAddress: expectedNft,
          expectedStandard: 'core',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects USDC sourced from a different allowed provider than the presigner', async () => {
    const rotatedSponsor =
      await createKeyPairSignerFromPrivateKeyBytes(rotatedSponsorSeed);
    const { account, wire, expectedNft } = await fixture({
      paymentOwner: rotatedSponsor.address,
    });

    await expect(
      new PackPartnerSigner(connection).signBuyback(
        account,
        wire,
        {
          amount: '11050000',
          assetAddress: expectedNft,
          expectedStandard: 'core',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each(['pnft', 'nft', 'cnft-core', 'unknown'] as const)(
    'never signs a Core transfer labelled %s',
    async (expectedStandard) => {
      const { account, wire, expectedNft } = await fixture();
      await expect(
        new PackPartnerSigner(connection).signBuyback(
          account,
          wire,
          {
            amount: '11050000',
            assetAddress: expectedNft,
            expectedStandard,
          },
          Network.Mainnet,
        ),
      ).rejects.toThrow('Pack Partner');
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );
});
