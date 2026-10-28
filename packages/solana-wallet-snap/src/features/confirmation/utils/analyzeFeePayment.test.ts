import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
  getApproveInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getCreateAssociatedTokenInstruction,
  getTransferCheckedInstruction,
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Decoder,
  getCompiledTransactionMessageEncoder,
  compileTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import type { Base64EncodedWireTransaction, Instruction } from '@solana/kit';

import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../core/test/mocks/solana-keyring-accounts';
import { parseInstruction } from '../../../entities';
import type {
  AccountSnapshot,
  FeePayment,
  FeePaymentChainReader,
  SimulatedInstruction,
} from './analyzeFeePayment';
import { analyzeFeePayment, getFeePayer } from './analyzeFeePayment';

const user = address(MOCK_SOLANA_KEYRING_ACCOUNT_0.address);
const otherOwnAccount = address('FvS1p2dQnhWNrHyuVpJRU5mkYRkSTrubXHs4XrAn3PGo');
const sponsor = address('CDg3bPoM21fSXEzrXWHWyJR33JHX6xaYboq5p7s4uo48');
const recipient = address('9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg');
const usdcMint = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const userUsdcAccount = address('238BYhc1qz4S62GBFGhFm3233PC9S6dmhtikjzKendsz');
const sponsorUsdcAccount = address(
  'xDTVdH7CGuDhRebhtfSxE33ZL1crUKwM3GnSb9a7DKm',
);
const recipientUsdcAccount = address(
  '61DFfeTKM7trxYcPQCM78bJ794ddZprZpAwAnLiwTpYH',
);
const unknownProgram = address('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const cowSettlementProgram = address(
  'Moook87DzJ25dELx3LXJ3dnu5a4ERVFwKo1PWWF4p7Y',
);
const orderAccount = address('B6acm3swJK9pJ7fe4i4GQgP7x5A3RndvsdV2bKhcA1i5');

// Inner instructions in the RPC `jsonParsed` format.
const innerSystem = (type: string, info: object): SimulatedInstruction => ({
  programId: '11111111111111111111111111111111',
  program: 'system',
  parsed: { type, info },
});
const innerToken = (type: string, info: object): SimulatedInstruction => ({
  programId: TOKEN_PROGRAM_ADDRESS,
  program: 'spl-token',
  parsed: { type, info },
});

const userSigner = createNoopSigner(user);

const ATA_RENT_LAMPORTS = 2_039_280n;
const ATA_2022_RENT_LAMPORTS = 2_074_080n;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the message type is inferred from the kit pipeline
const buildMessage = (feePayer: string, instructions: Instruction[]) =>
  pipe(
    createTransactionMessage({ version: 0 }),
    (message) => setTransactionMessageFeePayer(address(feePayer), message),
    (message) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash('11111111111111111111111111111111'),
          lastValidBlockHeight: 0n,
        },
        message,
      ),
    (message) => appendTransactionMessageInstructions(instructions, message),
  );

const buildTransaction = (
  feePayer: string,
  instructions: Instruction[],
): Base64EncodedWireTransaction =>
  getBase64EncodedWireTransaction(
    compileTransaction(buildMessage(feePayer, instructions)),
  );

const buildReader = (
  accounts: Record<string, AccountSnapshot> = {},
  innerInstructions: SimulatedInstruction[] | null = null,
): FeePaymentChainReader => ({
  getAccounts: jest.fn(async (addresses: string[]) =>
    Object.fromEntries(
      addresses.map((account) => [account, accounts[account] ?? null]),
    ),
  ),
  getRentExemptMinimum: jest.fn(async (space: number) =>
    space === 165 ? ATA_RENT_LAMPORTS : ATA_2022_RENT_LAMPORTS,
  ),
  getTokenSymbol: jest.fn(async () => 'USDC'),
  simulateInnerInstructions: jest.fn(async () => innerInstructions),
});

const analyze = async (
  feePayer: string,
  instructions: Instruction[],
  reader = buildReader(),
): Promise<FeePayment> =>
  analyzeFeePayment({
    transaction: buildTransaction(feePayer, instructions),
    accountAddress: user,
    ownAddresses: [user, otherOwnAccount],
    instructions: instructions.map(parseInstruction),
    reader,
  });

const transferSol = (destination: string, amount: bigint): Instruction =>
  getTransferSolInstruction({
    source: userSigner,
    destination: address(destination),
    amount,
  });

// A program the Snap cannot parse: CoW Protocol `CreateOrder`, as built by
// `buildCreateOrderInstruction` in `@cowprotocol/sdk-trading-solana`.
const cowCreateOrder = (createdBy: string): Instruction => ({
  programAddress: cowSettlementProgram,
  accounts: [
    { address: user, role: AccountRole.READONLY_SIGNER },
    { address: address(createdBy), role: AccountRole.WRITABLE_SIGNER },
    { address: orderAccount, role: AccountRole.WRITABLE },
    {
      address: address('11111111111111111111111111111111'),
      role: AccountRole.READONLY,
    },
  ],
  data: new Uint8Array([2, ...new Uint8Array(213)]),
});

const transferUsdc = (destination: string, amount: bigint): Instruction =>
  getTransferCheckedInstruction({
    source: userUsdcAccount,
    mint: usdcMint,
    destination: address(destination),
    authority: userSigner,
    amount,
    decimals: 6,
  });

describe('getFeePayer', () => {
  it('returns the first account of a wire transaction', async () => {
    expect(await getFeePayer(buildTransaction(sponsor, []))).toBe(sponsor);
  });

  it('returns the first account of a bare transaction message', async () => {
    const messageBase64 = pipe(
      buildMessage(sponsor, [transferSol(recipient, 1n)]),
      compileTransactionMessage,
      (compiled) => getCompiledTransactionMessageEncoder().encode(compiled),
      (bytes) => getBase64Decoder().decode(bytes),
    );

    expect(await getFeePayer(messageBase64)).toBe(sponsor);
  });
});

describe('analyzeFeePayment', () => {
  it('reports that the account pays when it is the fee payer', async () => {
    expect(await analyze(user, [transferSol(recipient, 1000n)])).toStrictEqual({
      feePayer: user,
      paidBy: 'account',
      userCost: null,
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
    });
  });

  it('reports another account of the wallet as the payer', async () => {
    expect(
      await analyze(otherOwnAccount, [transferSol(recipient, 1000n)]),
    ).toStrictEqual({
      feePayer: otherOwnAccount,
      paidBy: 'ownAccount',
      userCost: null,
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
    });
  });

  it('reports a sponsored transfer as free', async () => {
    expect(
      await analyze(sponsor, [
        transferSol(recipient, 1000n),
        transferUsdc(recipientUsdcAccount, 5_000_000n),
      ]),
    ).toStrictEqual({
      feePayer: sponsor,
      paidBy: 'sponsor',
      userCost: 'free',
      userCosts: [],
      mayCostMore: false,
      uncheckedPrograms: [],
    });
  });

  it('reports SOL sent to the sponsor as a cost', async () => {
    const result = await analyze(sponsor, [
      transferSol(recipient, 1000n),
      transferSol(sponsor, 5000n),
      transferSol(sponsor, 2500n),
    ]);

    expect(result.userCost).toBe('costs');
    expect(result.userCosts).toStrictEqual([
      { type: 'solToSponsor', lamports: '7500' },
    ]);
  });

  it('reports tokens sent to an existing sponsor token account as a cost', async () => {
    const reader = buildReader({
      [sponsorUsdcAccount]: {
        tokenOwner: sponsor,
        mint: usdcMint,
        decimals: 6,
      },
      [recipientUsdcAccount]: {
        tokenOwner: recipient,
        mint: usdcMint,
        decimals: 6,
      },
    });

    const result = await analyze(
      sponsor,
      [
        transferUsdc(recipientUsdcAccount, 5_000_000n),
        transferUsdc(sponsorUsdcAccount, 150_000n),
      ],
      reader,
    );

    expect(result.userCost).toBe('costs');
    expect(result.userCosts).toStrictEqual([
      {
        type: 'tokenToSponsor',
        mint: usdcMint,
        amount: '150000',
        decimals: 6,
        symbol: 'USDC',
      },
    ]);
  });

  it('uses the token account decimals for unchecked transfers', async () => {
    const reader = buildReader({
      [sponsorUsdcAccount]: {
        tokenOwner: sponsor,
        mint: usdcMint,
        decimals: 6,
      },
    });

    const result = await analyze(
      sponsor,
      [
        getTransferInstruction({
          source: userUsdcAccount,
          destination: sponsorUsdcAccount,
          authority: userSigner,
          amount: 42n,
        }),
      ],
      reader,
    );

    expect(result.userCosts).toStrictEqual([
      {
        type: 'tokenToSponsor',
        mint: usdcMint,
        amount: '42',
        decimals: 6,
        symbol: 'USDC',
      },
    ]);
  });

  it('marks an unchecked transfer into a new sponsor account as unverified', async () => {
    const result = await analyze(sponsor, [
      getCreateAssociatedTokenInstruction({
        payer: createNoopSigner(sponsor),
        ata: sponsorUsdcAccount,
        owner: sponsor,
        mint: usdcMint,
      }),
      getTransferInstruction({
        source: userUsdcAccount,
        destination: sponsorUsdcAccount,
        authority: userSigner,
        amount: 42n,
      }),
    ]);

    expect(result.userCost).toBe('unverified');
    expect(result.mayCostMore).toBe(true);
  });

  it('recognizes a sponsor token account created in the same transaction', async () => {
    const result = await analyze(sponsor, [
      getCreateAssociatedTokenIdempotentInstruction({
        payer: createNoopSigner(sponsor),
        ata: sponsorUsdcAccount,
        owner: sponsor,
        mint: usdcMint,
      }),
      transferUsdc(sponsorUsdcAccount, 150_000n),
    ]);

    expect(result.userCosts).toStrictEqual([
      {
        type: 'tokenToSponsor',
        mint: usdcMint,
        amount: '150000',
        decimals: 6,
        symbol: 'USDC',
      },
    ]);
  });

  it('reports rent for accounts the user funds', async () => {
    const result = await analyze(sponsor, [
      getCreateAccountInstruction({
        payer: userSigner,
        newAccount: createNoopSigner(recipient),
        lamports: 1_000_000n,
        space: 0,
        programAddress: unknownProgram,
      }),
      getCreateAssociatedTokenInstruction({
        payer: userSigner,
        ata: recipientUsdcAccount,
        owner: recipient,
        mint: usdcMint,
      }),
      getCreateAssociatedTokenInstruction({
        payer: userSigner,
        ata: userUsdcAccount,
        owner: user,
        mint: usdcMint,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      }),
    ]);

    expect(result.userCosts).toStrictEqual([
      {
        type: 'rent',
        lamports: (
          1_000_000n +
          ATA_RENT_LAMPORTS +
          ATA_2022_RENT_LAMPORTS
        ).toString(),
      },
    ]);
  });

  it('skips rent for idempotent creations of existing accounts', async () => {
    const reader = buildReader({
      [userUsdcAccount]: { tokenOwner: user, mint: usdcMint, decimals: 6 },
    });

    const result = await analyze(
      sponsor,
      [
        getCreateAssociatedTokenIdempotentInstruction({
          payer: userSigner,
          ata: userUsdcAccount,
          owner: user,
          mint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        }),
        getCreateAssociatedTokenIdempotentInstruction({
          payer: userSigner,
          ata: recipientUsdcAccount,
          owner: recipient,
          mint: usdcMint,
        }),
      ],
      reader,
    );

    expect(result.userCosts).toStrictEqual([
      { type: 'rent', lamports: ATA_RENT_LAMPORTS.toString() },
    ]);
  });

  it('ignores rent the sponsor pays', async () => {
    const result = await analyze(sponsor, [
      getCreateAssociatedTokenInstruction({
        payer: createNoopSigner(sponsor),
        ata: recipientUsdcAccount,
        owner: recipient,
        mint: usdcMint,
      }),
      transferUsdc(recipientUsdcAccount, 1n),
    ]);

    expect(result.userCost).toBe('free');
  });

  it('marks instructions of unknown programs signed by the user as unverified', async () => {
    const result = await analyze(sponsor, [
      {
        programAddress: unknownProgram,
        accounts: [{ address: user, role: AccountRole.WRITABLE_SIGNER }],
        data: new Uint8Array([1]),
      },
    ]);

    expect(result).toStrictEqual({
      feePayer: sponsor,
      paidBy: 'sponsor',
      userCost: 'unverified',
      userCosts: [],
      mayCostMore: true,
      uncheckedPrograms: [unknownProgram],
    });
  });

  it('ignores instructions of unknown programs the user does not sign', async () => {
    const result = await analyze(sponsor, [
      {
        programAddress: unknownProgram,
        accounts: [{ address: user, role: AccountRole.WRITABLE }],
        data: new Uint8Array([1]),
      },
    ]);

    expect(result.userCost).toBe('free');
  });

  it('marks approvals to the sponsor as unverified', async () => {
    const result = await analyze(sponsor, [
      getApproveInstruction({
        source: userUsdcAccount,
        delegate: sponsor,
        owner: userSigner,
        amount: 1_000_000n,
      }),
    ]);

    expect(result.userCost).toBe('unverified');
  });

  it('keeps known costs and flags that the user may pay more', async () => {
    const result = await analyze(sponsor, [
      transferSol(sponsor, 5000n),
      {
        programAddress: unknownProgram,
        accounts: [{ address: user, role: AccountRole.READONLY_SIGNER }],
        data: new Uint8Array([1]),
      },
    ]);

    expect(result.userCost).toBe('costs');
    expect(result.mayCostMore).toBe(true);
  });

  it('does not query the chain when nothing needs checking', async () => {
    const reader = buildReader();

    await analyze(sponsor, [transferSol(recipient, 1n)], reader);

    expect(reader.getAccounts).not.toHaveBeenCalled();
    expect(reader.getRentExemptMinimum).not.toHaveBeenCalled();
  });

  describe('with a simulation', () => {
    const simulate = async (
      instructions: Instruction[],
      innerInstructions: SimulatedInstruction[],
      accounts: Record<string, AccountSnapshot> = {},
    ): Promise<{ result: FeePayment; reader: FeePaymentChainReader }> => {
      const reader = buildReader(accounts, innerInstructions);
      const result = await analyze(sponsor, instructions, reader);
      return { result, reader };
    };

    it('reports an order of another program as free when the sponsor funds it', async () => {
      const { result } = await simulate(
        [cowCreateOrder(sponsor)],
        [
          innerSystem('createAccount', {
            source: sponsor,
            newAccount: orderAccount,
            lamports: 2_728_320n,
            space: 264n,
            owner: cowSettlementProgram,
          }),
        ],
      );

      expect(result).toStrictEqual({
        feePayer: sponsor,
        paidBy: 'sponsor',
        userCost: 'free',
        userCosts: [],
        mayCostMore: false,
        uncheckedPrograms: [],
      });
    });

    it('reports rent another program makes the user pay', async () => {
      const { result, reader } = await simulate(
        [cowCreateOrder(user)],
        [
          innerSystem('createAccount', {
            source: user,
            newAccount: orderAccount,
            lamports: 2_728_320n,
            space: 264n,
            owner: cowSettlementProgram,
          }),
        ],
      );

      expect(result.userCosts).toStrictEqual([
        { type: 'rent', lamports: '2728320' },
      ]);
      expect(result.mayCostMore).toBe(false);
      expect(reader.getRentExemptMinimum).not.toHaveBeenCalled();
    });

    it('counts associated token account rent once, from the simulation', async () => {
      const { result, reader } = await simulate(
        [
          getCreateAssociatedTokenInstruction({
            payer: userSigner,
            ata: recipientUsdcAccount,
            owner: recipient,
            mint: usdcMint,
          }),
        ],
        [
          innerSystem('createAccount', {
            source: user,
            newAccount: recipientUsdcAccount,
            lamports: 1_488_440n,
            space: 165n,
            owner: TOKEN_PROGRAM_ADDRESS,
          }),
        ],
      );

      expect(result.userCosts).toStrictEqual([
        { type: 'rent', lamports: '1488440' },
      ]);
      expect(reader.getRentExemptMinimum).not.toHaveBeenCalled();
    });

    it('reports SOL another program sends from the user to the sponsor', async () => {
      const { result } = await simulate(
        [cowCreateOrder(sponsor)],
        [
          innerSystem('transfer', {
            source: user,
            destination: sponsor,
            lamports: 5000n,
          }),
        ],
      );

      expect(result.userCosts).toStrictEqual([
        { type: 'solToSponsor', lamports: '5000' },
      ]);
    });

    it('reports tokens another program sends to a new sponsor token account', async () => {
      const { result } = await simulate(
        [cowCreateOrder(sponsor)],
        [
          innerToken('initializeAccount3', {
            account: sponsorUsdcAccount,
            mint: usdcMint,
            owner: sponsor,
          }),
          innerToken('transferChecked', {
            source: userUsdcAccount,
            mint: usdcMint,
            destination: sponsorUsdcAccount,
            authority: user,
            tokenAmount: { amount: '150000', decimals: 6 },
          }),
        ],
      );

      expect(result.userCosts).toStrictEqual([
        {
          type: 'tokenToSponsor',
          mint: usdcMint,
          amount: '150000',
          decimals: 6,
          symbol: 'USDC',
        },
      ]);
    });

    it('looks up the owner of existing token accounts receiving invoked transfers', async () => {
      const { result } = await simulate(
        [cowCreateOrder(sponsor)],
        [
          innerToken('transfer', {
            source: userUsdcAccount,
            destination: sponsorUsdcAccount,
            authority: user,
            amount: '42',
          }),
        ],
        {
          [sponsorUsdcAccount]: {
            tokenOwner: sponsor,
            mint: usdcMint,
            decimals: 6,
          },
        },
      );

      expect(result.userCosts).toStrictEqual([
        {
          type: 'tokenToSponsor',
          mint: usdcMint,
          amount: '42',
          decimals: 6,
          symbol: 'USDC',
        },
      ]);
    });

    it('marks invoked approvals to the sponsor as unverified', async () => {
      const { result } = await simulate(
        [cowCreateOrder(sponsor)],
        [
          innerToken('approve', {
            source: userUsdcAccount,
            delegate: sponsor,
            owner: user,
            amount: '1000000',
          }),
        ],
      );

      expect(result.userCost).toBe('unverified');
      expect(result.uncheckedPrograms).toStrictEqual([]);
    });

    it('ignores invoked instructions the RPC cannot parse', async () => {
      const { result } = await simulate(
        [cowCreateOrder(sponsor)],
        [{ programId: unknownProgram, accounts: [user, sponsor], data: '1' }],
      );

      expect(result.userCost).toBe('free');
    });

    it('falls back to the instructions alone when the simulation fails', async () => {
      const result = await analyze(sponsor, [cowCreateOrder(sponsor)]);

      expect(result.userCost).toBe('unverified');
      expect(result.uncheckedPrograms).toStrictEqual([cowSettlementProgram]);
    });

    it('does not simulate when the user pays the fee', async () => {
      const reader = buildReader();

      await analyze(user, [cowCreateOrder(user)], reader);

      expect(reader.simulateInnerInstructions).not.toHaveBeenCalled();
    });
  });
});
