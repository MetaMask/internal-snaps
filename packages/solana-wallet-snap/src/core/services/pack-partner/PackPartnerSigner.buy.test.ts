import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import { assert } from '@metamask/utils';
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Fixture helpers preserve their inferred shapes. */
/* eslint-disable id-denylist -- Solana RPC names its simulation error field `err`. */
import {
  SYSTEM_PROGRAM_ADDRESS,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
  findAssociatedTokenPda,
  getTokenEncoder,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import {
  AccountRole,
  address,
  blockhash,
  compileTransaction,
  createKeyPairSignerFromPrivateKeyBytes,
  createTransactionMessage,
  appendTransactionMessageInstructions,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  getBase64Encoder,
  getBase64Decoder,
  getTransactionDecoder,
  getPublicKeyFromAddress,
  partiallySignTransaction,
  verifySignature,
} from '@solana/kit';
import type { Address, Instruction } from '@solana/kit';

import { Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import { deriveSolanaKeypair } from '../../utils/deriveSolanaKeypair';
import * as DeriveSolanaKeypair from '../../utils/deriveSolanaKeypair';
import type { SolanaConnection } from '../connection';
import * as PackPartnerConstants from './constants';
import { PACK_PARTNER_MAX_FEE, getPackPartnerNetworkConfig } from './constants';
import { PackPartnerSigner } from './PackPartnerSigner';

// Deterministic test-only keys. The real signature verifier is never mocked.
const userSeed = new Uint8Array(32).fill(1);
const providerSeed = new Uint8Array(32).fill(2);
const rotatedProviderSeed = new Uint8Array(32).fill(3);
const originalNetworkConfig = getPackPartnerNetworkConfig;
const { usdcMint } = originalNetworkConfig(Network.Mainnet);
const memoProgram = address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
// Test-only second allowlisted program: production remains pinned to reviewed programs.
const rotatedMemoProgram = address(
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
);
const recipient = address('11111111111111111111111111111112');
const rpc = {
  getMultipleAccounts: vi.fn(),
  getFeeForMessage: vi.fn(),
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
};
const connection = {
  getRpc: vi.fn(() => rpc),
} as unknown as SolanaConnection;
const request = (value: unknown) => ({
  send: vi.fn().mockResolvedValue(value),
});

const solAccount = (lamports: bigint) => ({
  lamports,
  owner: SYSTEM_PROGRAM_ADDRESS,
  executable: false,
  data: ['', 'base64'] as const,
});
const tokenAccount = (
  owner: ReturnType<typeof address>,
  amount: bigint,
  mint: ReturnType<typeof address> = usdcMint,
) => ({
  lamports: 2039280n,
  owner: TOKEN_PROGRAM_ADDRESS,
  executable: false,
  data: [
    getBase64Decoder().decode(
      getTokenEncoder().encode({
        mint,
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

describe('PackPartnerSigner purchases and shared guards', () => {
  async function fixture({
    userPays = false,
    amount = 25_000_000n,
    extra = [],
    extraUserSpend = 0n,
    treasuryDrift = 0n,
    userLamports = 1_000_000n,
    userLamportsAfter = userLamports,
    network = Network.Mainnet,
    fee = 10_000n,
    providerKeySeed = providerSeed,
    transactionMemoProgram = memoProgram,
    paymentOwner,
    additionalSigner,
  }: {
    userPays?: boolean;
    amount?: bigint;
    extra?: Instruction[];
    extraUserSpend?: bigint;
    treasuryDrift?: bigint;
    userLamports?: bigint | null;
    userLamportsAfter?: bigint | null;
    network?: Network;
    fee?: bigint;
    providerKeySeed?: Uint8Array;
    transactionMemoProgram?: Address;
    paymentOwner?: Address;
    additionalSigner?: Address;
  } = {}) {
    vi.spyOn(DeriveSolanaKeypair, 'deriveSolanaKeypair');
    const trustedProviders = await Promise.all(
      [providerSeed, rotatedProviderSeed].map((seed) =>
        createKeyPairSignerFromPrivateKeyBytes(seed),
      ),
    );
    vi.spyOn(
      PackPartnerConstants,
      'getPackPartnerNetworkConfig',
    ).mockImplementation((scope) => ({
      ...originalNetworkConfig(scope),
      signers: trustedProviders.map(
        ({ address: providerAddress }) => providerAddress,
      ),
      memoPrograms: [memoProgram, rotatedMemoProgram],
    }));
    const { usdcMint: mint } = getPackPartnerNetworkConfig(network);
    const user = await createKeyPairSignerFromPrivateKeyBytes(userSeed);
    const provider =
      await createKeyPairSignerFromPrivateKeyBytes(providerKeySeed);
    const [userAta] = await findAssociatedTokenPda({
      owner: user.address,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [providerAta] = await findAssociatedTokenPda({
      owner: paymentOwner ?? provider.address,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const baseMessage = setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash('11111111111111111111111111111111'),
        lastValidBlockHeight: 100n,
      },
      setTransactionMessageFeePayer(
        userPays ? user.address : provider.address,
        createTransactionMessage({ version: 'legacy' }),
      ),
    );
    const message = appendTransactionMessageInstructions(
      [
        {
          programAddress: transactionMemoProgram,
          data: new Uint8Array([1]),
          accounts: [
            { address: provider.address, role: AccountRole.READONLY_SIGNER },
            ...(additionalSigner
              ? [
                  {
                    address: additionalSigner,
                    role: AccountRole.READONLY_SIGNER,
                  },
                ]
              : []),
          ],
        },
        getTransferCheckedInstruction({
          source: userAta,
          mint,
          destination: providerAta,
          authority: user.address,
          amount,
          decimals: 6,
          multiSigners: [],
        }),
        ...extra,
      ],
      baseMessage,
    );
    // Transfer authority supplied as address needs its signer role explicitly marked.
    const compiled = compileTransaction({
      ...message,
      instructions: message.instructions.map((ix) => ({
        ...ix,
        accounts: (ix.accounts ?? []).map((a) =>
          a.address === user.address
            ? { ...a, role: AccountRole.READONLY_SIGNER }
            : a,
        ),
      })),
    });
    const transaction = await partiallySignTransaction(
      [provider.keyPair],
      compiled,
    );
    const account = {
      id: '00000000-0000-4000-8000-000000000001',
      address: user.address,
      scopes: [network],
      entropySource: 'test',
      derivationPath: "m/44'/501'/0'/0'",
    } as unknown as ExtendedKeyringAccount;
    vi.mocked(deriveSolanaKeypair).mockResolvedValue({
      privateKeyBytes: userSeed,
      publicKeyBytes: new Uint8Array(32),
    });
    const before = new Map<
      string,
      ReturnType<typeof solAccount> | ReturnType<typeof tokenAccount> | null
    >([
      [user.address, userLamports === null ? null : solAccount(userLamports)],
      [provider.address, solAccount(5_000_000n)],
      [userAta, tokenAccount(user.address, 50_000_000n, mint)],
      [providerAta, tokenAccount(provider.address, 50_000_000n, mint)],
    ]);
    let accounts: string[] = [];
    rpc.getMultipleAccounts.mockImplementation((addresses: string[]) => {
      accounts = addresses;
      return request({
        context: { slot: 1n },
        value: addresses.map((a) =>
          before.has(a) ? before.get(a) : solAccount(0n),
        ),
      });
    });
    rpc.getFeeForMessage.mockReturnValue(
      request({ context: { slot: 1n }, value: fee }),
    );
    const simulatedAccount = (accountAddress: string) => {
      if (accountAddress === user.address) {
        return userLamportsAfter === null
          ? null
          : solAccount(
              userLamportsAfter - (userPays ? fee : 0n) - extraUserSpend,
            );
      }
      if (accountAddress === userAta) {
        return tokenAccount(user.address, 25_000_000n, mint);
      }
      if (accountAddress === providerAta) {
        return tokenAccount(
          provider.address,
          75_000_000n + treasuryDrift,
          mint,
        );
      }
      if (accountAddress === provider.address) {
        return solAccount(5_000_000n - (userPays ? 0n : fee));
      }
      return before.get(accountAddress) ?? solAccount(0n);
    };
    rpc.simulateTransaction.mockImplementation(() =>
      request({
        context: { slot: 1n },
        value: { err: null, accounts: accounts.map(simulatedAccount) },
      }),
    );
    return {
      account,
      transaction,
      wire: fromTransactionToBase64String(transaction),
      user,
      provider,
    };
  }

  it.each([false, true])(
    'validates and signs a buy (user pays fees: %s)',
    async (userPays) => {
      const { account, wire, transaction, user, provider } = await fixture({
        userPays,
      });
      const result = await new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      );
      const signed = getTransactionDecoder().decode(
        getBase64Encoder().encode(result.signedTransaction),
      );
      expect(signed.messageBytes).toStrictEqual(transaction.messageBytes);
      expect(signed.signatures[provider.address]).toStrictEqual(
        transaction.signatures[provider.address],
      );
      const userSignature = signed.signatures[user.address];
      assert(userSignature, 'Missing user signature');
      expect(
        await verifySignature(
          await getPublicKeyFromAddress(user.address),
          userSignature,
          signed.messageBytes,
        ),
      ).toBe(true);
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { network: Network.Mainnet, userLamports: null },
    { network: Network.Mainnet, userLamports: 0n },
    { network: Network.Devnet, userLamports: null },
    { network: Network.Devnet, userLamports: 0n },
  ])(
    'signs a sponsored purchase without SOL on $network (lamports: $userLamports)',
    async ({ network, userLamports }) => {
      const { account, wire } = await fixture({ network, userLamports });

      const result = await new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        network,
      );

      expect(result.signedTransaction).toStrictEqual(expect.any(String));
      expect(deriveSolanaKeypair).toHaveBeenCalledTimes(1);
      expect(rpc.getFeeForMessage).not.toHaveBeenCalled();
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { userLamports: null, userLamportsAfter: 1n },
    { userLamports: 1n, userLamportsAfter: null },
    { userLamports: null, userLamportsAfter: null, userPays: true },
  ])(
    'rejects an unexpected or fee-paying absent user account: $userLamports → $userLamportsAfter ($userPays)',
    async (options) => {
      const { account, wire } = await fixture(options);

      await expect(
        new PackPartnerSigner(connection).signBuy(
          account,
          wire,
          { amount: '25000000' },
          Network.Mainnet,
        ),
      ).rejects.toThrow('invalid signer account');
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it.each([
    Network.Testnet,
    Network.Localnet,
    'solana:unknown' as Network,
    'toString' as Network,
    undefined as unknown as Network,
  ])('rejects an unconfigured scope %s before RPC or keys', async (scope) => {
    const { account, wire } = await fixture();
    vi.clearAllMocks();
    const signer = new PackPartnerSigner(connection);

    await expect(
      signer.signBuy(account, wire, { amount: '25000000' }, scope),
    ).rejects.toThrow('No Pack Partner configuration for network');
    expect(connection.getRpc).not.toHaveBeenCalled();
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('validates a devnet purchase using the devnet RPC and token', async () => {
    const { account, wire } = await fixture({ network: Network.Devnet });

    const result = await new PackPartnerSigner(connection).signBuy(
      account,
      wire,
      { amount: '25000000' },
      Network.Devnet,
    );

    expect(result.signedTransaction).toStrictEqual(expect.any(String));
    expect(connection.getRpc).toHaveBeenCalledWith(Network.Devnet);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects mainnet token instructions in a devnet request', async () => {
    const { account, wire } = await fixture();
    vi.mocked(deriveSolanaKeypair).mockClear();

    await expect(
      new PackPartnerSigner(connection).signBuy(
        { ...account, scopes: [Network.Devnet] },
        wire,
        { amount: '25000000' },
        Network.Devnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);

    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects a devnet token on mainnet before deriving a private key', async () => {
    const { account, wire } = await fixture({ network: Network.Devnet });
    vi.mocked(deriveSolanaKeypair).mockClear();

    await expect(
      new PackPartnerSigner(connection).signBuy(
        { ...account, scopes: [Network.Mainnet] },
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);

    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('accepts unrelated treasury activity between RPC snapshots', async () => {
    const { account, wire } = await fixture({ treasuryDrift: 5_000_000n });
    const result = await new PackPartnerSigner(connection).signBuy(
      account,
      wire,
      { amount: '25000000' },
      Network.Mainnet,
    );
    expect(result.signedTransaction).toStrictEqual(expect.any(String));
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it.each([25000000, 25000000n])(
    'rejects a non-string atomic amount %s before RPC or keys',
    async (amount) => {
      const { account, wire } = await fixture();
      vi.clearAllMocks();

      await expect(
        new PackPartnerSigner(connection).signBuy(
          account,
          wire,
          { amount: amount as unknown as string },
          Network.Mainnet,
        ),
      ).rejects.toThrow('amount must be a positive atomic integer');
      expect(connection.getRpc).not.toHaveBeenCalled();
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it('rejects a different confirmed amount before deriving a signing key', async () => {
    const { account, wire } = await fixture();
    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        {
          amount: '26000000',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects an extra SOL transfer hidden in the same presigned message', async () => {
    const user = await createKeyPairSignerFromPrivateKeyBytes(userSeed);
    const { account, wire } = await fixture({
      extra: [
        getTransferSolInstruction({
          source: user,
          destination: recipient,
          amount: 1n,
        }),
      ],
    });
    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        {
          amount: '25000000',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/unsupported instruction/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each([null, 0n, -1n])(
    'rejects unavailable or invalid network fees: %s',
    async (fee) => {
      const { account, wire } = await fixture({ userPays: true });
      rpc.getFeeForMessage.mockReturnValue(
        request({ context: { slot: 1n }, value: fee }),
      );

      await expect(
        new PackPartnerSigner(connection).signBuy(
          account,
          wire,
          { amount: '25000000' },
          Network.Mainnet,
        ),
      ).rejects.toThrow(/fee unavailable or blockhash expired/u);
      expect(rpc.simulateTransaction).not.toHaveBeenCalled();
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it('accepts the exact network fee cap when the user pays', async () => {
    const { account, wire } = await fixture({
      userPays: true,
      fee: PACK_PARTNER_MAX_FEE,
    });

    expect(
      await new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).toMatchObject({ signedTransaction: expect.any(String) });
    expect(deriveSolanaKeypair).toHaveBeenCalledTimes(1);
  });

  it('rejects network fees above the cap when the user pays', async () => {
    const { account, wire } = await fixture({
      userPays: true,
      fee: PACK_PARTNER_MAX_FEE + 1n,
    });

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/fee exceeds cap/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'rejects simulated SOL spending beyond the network fee (user pays: %s)',
    async (userPays) => {
      const { account, wire } = await fixture({ userPays, extraUserSpend: 1n });

      await expect(
        new PackPartnerSigner(connection).signBuy(
          account,
          wire,
          { amount: '25000000' },
          Network.Mainnet,
        ),
      ).rejects.toThrow(/unexpected user SOL/u);
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
    },
  );

  it('rejects a user-paid simulation that does not debit the exact fee', async () => {
    const { account, wire } = await fixture({
      userPays: true,
      extraUserSpend: -1n,
    });

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/unexpected user SOL/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each([providerSeed, rotatedProviderSeed])(
    'accepts each reviewed provider during signer rotation',
    async (providerKeySeed) => {
      const { account, wire } = await fixture({ providerKeySeed });

      expect(
        await new PackPartnerSigner(connection).signBuy(
          account,
          wire,
          { amount: '25000000' },
          Network.Mainnet,
        ),
      ).toMatchObject({ signedTransaction: expect.any(String) });
    },
  );

  it.each([memoProgram, rotatedMemoProgram])(
    'accepts each independently reviewed memo program: %s',
    async (transactionMemoProgram) => {
      const { account, wire } = await fixture({ transactionMemoProgram });

      expect(
        await new PackPartnerSigner(connection).signBuy(
          account,
          wire,
          { amount: '25000000' },
          Network.Mainnet,
        ),
      ).toMatchObject({ signedTransaction: expect.any(String) });
    },
  );

  it.each([
    ['an untrusted presigner', { providerKeySeed: new Uint8Array(32).fill(4) }],
    ['an untrusted memo program', { transactionMemoProgram: recipient }],
  ])('rejects %s before accessing the signing key', async (_name, options) => {
    const { account, wire } = await fixture(options);

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects payment to a different allowed provider than the presigner', async () => {
    const rotatedProvider =
      await createKeyPairSignerFromPrivateKeyBytes(rotatedProviderSeed);
    const { account, wire } = await fixture({
      paymentOwner: rotatedProvider.address,
    });

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects two provider signer slots even when both providers are allowed', async () => {
    const rotatedProvider =
      await createKeyPairSignerFromPrivateKeyBytes(rotatedProviderSeed);
    const { account, wire } = await fixture({
      additionalSigner: rotatedProvider.address,
    });

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects failed simulation before deriving the account key', async () => {
    const { account, wire } = await fixture();
    rpc.simulateTransaction.mockReturnValue(
      request({
        context: { slot: 1n },
        value: { err: 'InstructionError', accounts: null },
      }),
    );
    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        {
          amount: '25000000',
        },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/simulation/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('simulates the exact presigned message without replacing its blockhash', async () => {
    const { account, wire } = await fixture();

    await new PackPartnerSigner(connection).signBuy(
      account,
      wire,
      { amount: '25000000' },
      Network.Mainnet,
    );

    const addresses = rpc.getMultipleAccounts.mock.calls[0]?.[0];
    expect(rpc.simulateTransaction).toHaveBeenCalledExactlyOnceWith(wire, {
      encoding: 'base64',
      commitment: 'confirmed',
      minContextSlot: 1n,
      sigVerify: false,
      replaceRecentBlockhash: false,
      accounts: { addresses, encoding: 'base64' },
    });
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects an incomplete pre-state before simulation or key derivation', async () => {
    const { account, wire } = await fixture();
    rpc.getMultipleAccounts.mockReturnValue(
      request({ context: { slot: 1n }, value: [] }),
    );

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow('incomplete account snapshot');
    expect(rpc.simulateTransaction).not.toHaveBeenCalled();
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each([undefined, null, []])(
    'rejects incomplete simulation accounts (%#) even without an execution error',
    async (accounts) => {
      const { account, wire } = await fixture();
      rpc.simulateTransaction.mockReturnValue(
        request({
          context: { slot: 1n },
          value: { err: null, accounts },
        }),
      );

      await expect(
        new PackPartnerSigner(connection).signBuy(
          account,
          wire,
          { amount: '25000000' },
          Network.Mainnet,
        ),
      ).rejects.toThrow('failed or incomplete simulation');
      expect(deriveSolanaKeypair).not.toHaveBeenCalled();
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing provider presignature before RPC or key derivation', async () => {
    const { account, transaction, provider } = await fixture();
    const unsignedProvider = {
      ...transaction,
      signatures: { ...transaction.signatures, [provider.address]: null },
    };

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        fromTransactionToBase64String(unsignedProvider),
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow('missing or invalid Pack Partner presignature');
    expect(connection.getRpc).not.toHaveBeenCalled();
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects an already user-signed transaction before RPC or key derivation', async () => {
    const { account, transaction, user } = await fixture();
    const alreadySigned = await partiallySignTransaction(
      [user.keyPair],
      transaction,
    );

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        fromTransactionToBase64String(alreadySigned),
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow('user transaction is already signed');
    expect(connection.getRpc).not.toHaveBeenCalled();
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects a derived key that does not belong to the selected account', async () => {
    const { account, wire } = await fixture();
    vi.mocked(deriveSolanaKeypair).mockResolvedValue({
      privateKeyBytes: rotatedProviderSeed,
      publicKeyBytes: new Uint8Array(32),
    });

    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        wire,
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow('derived key does not match account');
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects a tampered presignature', async () => {
    const { account, transaction, provider } = await fixture();
    const providerSignature = transaction.signatures[provider.address];
    assert(providerSignature, 'Missing fixture presignature');
    const signatureByte = providerSignature[0];
    assert(signatureByte !== undefined, 'Empty fixture presignature');
    providerSignature[0] = (signatureByte + 1) % 256;
    await expect(
      new PackPartnerSigner(connection).signBuy(
        account,
        fromTransactionToBase64String(transaction),
        { amount: '25000000' },
        Network.Mainnet,
      ),
    ).rejects.toThrow(/Pack Partner|Unexpected/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });
});
