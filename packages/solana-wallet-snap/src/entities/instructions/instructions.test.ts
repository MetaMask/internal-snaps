import { assert } from '@metamask/utils';
import { address } from '@solana/kit';
import type { Rpc, SolanaRpcApi } from '@solana/kit';

import { MOCK_EXECUTION_SCENARIO_SEND_SPL_TOKEN } from '../../core/services/signer/mocks/scenarios/sendSplToken';
import { EXPECTED_FAILED_SWAP_DATA } from '../../core/test/mocks/transactions-data/failed-swap';
import { EXPECTED_SEND_SPL_TOKEN_AND_CREATE_TOKEN_ACCOUNT_DATA } from '../../core/test/mocks/transactions-data/send-spl-token-and-create-token-account';
import { EXPECTED_SWAP_SOL_TO_OBRIC_DATA } from '../../core/test/mocks/transactions-data/swap-sol-to-obric';
import { EXPECTED_SWAP_TRUMP_TO_JUP_DATA } from '../../core/test/mocks/transactions-data/swap-trump-to-jup';
import { EXPECTED_SWAP_USDC_TO_COBIE_DATA } from '../../core/test/mocks/transactions-data/swap-usdc-to-cobie';
import * as Errors from '../../core/utils/errors';
import { trackError } from '../../core/utils/errors';
import type { InstructionParseResult } from './instructions';
import {
  extractInstructionsFromUnknownBase64String,
  parseInstruction,
  toIInstruction,
} from './instructions';

describe('toIInstruction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Errors, 'trackError').mockResolvedValue('tracked-error-id');
  });

  it.each(['legacy', 0, 1] as const)(
    'preserves inline account order for version %s',
    (version) => {
      const feePayer = address('11111111111111111111111111111112');
      const readonlySigner = address('11111111111111111111111111111113');
      const writableAccount = address('11111111111111111111111111111114');
      const readonlyAccount = address('11111111111111111111111111111115');
      const programAddress = address('11111111111111111111111111111116');
      const original = EXPECTED_SEND_SPL_TOKEN_AND_CREATE_TOKEN_ACCOUNT_DATA;
      const [originalInstruction] = original.transaction.message.instructions;
      assert(originalInstruction);
      const instruction = {
        ...originalInstruction,
        accounts: [3, 0, 2, 1, 2],
        programIdIndex: 4,
      };
      const transaction = {
        ...original,
        version,
        meta: null,
        transaction: {
          ...original.transaction,
          message: {
            header: {
              numRequiredSignatures: 2,
              numReadonlySignedAccounts: 1,
              numReadonlyUnsignedAccounts: 2,
            },
            accountKeys: [
              feePayer,
              readonlySigner,
              writableAccount,
              readonlyAccount,
              programAddress,
            ],
            instructions: [instruction],
            recentBlockhash: original.transaction.message.recentBlockhash,
            ...(version === 1 && {
              transactionConfig: {
                computeUnitLimit: 30_000,
                heapSize: null,
                loadedAccountsDataSizeLimit: 200_000,
                priorityFee: null,
              },
            }),
          },
        },
      };

      expect(toIInstruction(instruction, transaction)).toStrictEqual({
        programAddress,
        data: new Uint8Array([3, 16, 39, 0, 0, 0, 0, 0, 0]),
        accounts: [
          { address: readonlyAccount, role: 0 },
          { address: feePayer, role: 0 },
          { address: writableAccount, role: 0 },
          { address: readonlySigner, role: 0 },
          { address: writableAccount, role: 0 },
        ],
      });
    },
  );

  it.each([
    ['failed swap', EXPECTED_FAILED_SWAP_DATA],
    ['SOL to OBRIC swap', EXPECTED_SWAP_SOL_TO_OBRIC_DATA],
    ['TRUMP to JUP swap', EXPECTED_SWAP_TRUMP_TO_JUP_DATA],
    ['USDC to COBIE swap', EXPECTED_SWAP_USDC_TO_COBIE_DATA],
  ])(
    'parses account creation using lookup table accounts in a %s',
    (_, transaction) => {
      const { accountKeys, instructions } = transaction.transaction.message;
      const accountCreationInstruction = instructions.find(
        (instruction) =>
          accountKeys[instruction.programIdIndex] ===
            'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' &&
          instruction.accounts.some((index) => index >= accountKeys.length),
      );
      if (!accountCreationInstruction) {
        throw new Error('Fixture must contain an associated token instruction');
      }

      const converted = toIInstruction(accountCreationInstruction, transaction);

      expect(converted.accounts).toHaveLength(6);
      expect(parseInstruction(converted).type).toBe(
        'CreateAssociatedTokenIdempotent',
      );
      expect(trackError).not.toHaveBeenCalled();
    },
  );

  it('resolves writable and readonly lookup addresses in account index order', () => {
    const transaction = EXPECTED_SWAP_SOL_TO_OBRIC_DATA;
    const { accountKeys } = transaction.transaction.message;
    const { writable = [], readonly = [] } =
      transaction.meta?.loadedAddresses ?? {};
    const writableIndex = accountKeys.length;
    const readonlyIndex = writableIndex + writable.length;
    const [originalInstruction] = transaction.transaction.message.instructions;
    assert(originalInstruction);
    const instruction = {
      ...originalInstruction,
      accounts: [readonlyIndex, 0, writableIndex, readonlyIndex],
      programIdIndex: readonlyIndex,
    };

    const converted = toIInstruction(instruction, transaction);

    expect(converted.accounts).toStrictEqual(
      [readonly[0], accountKeys[0], writable[0], readonly[0]].map(
        (accountAddress) => ({ address: accountAddress, role: 0 }),
      ),
    );
    expect(converted.programAddress).toBe(readonly[0]);
  });

  it('keeps static account resolution when lookup addresses are absent', () => {
    const transaction = EXPECTED_SEND_SPL_TOKEN_AND_CREATE_TOKEN_ACCOUNT_DATA;
    const instruction = transaction.transaction.message.instructions[1];
    assert(instruction);

    const converted = toIInstruction(instruction, {
      ...transaction,
      meta: null,
    });

    expect(converted.accounts).toStrictEqual(
      instruction.accounts.map((index) => ({
        address: transaction.transaction.message.accountKeys[index],
        role: 0,
      })),
    );
  });

  it('rejects an instruction whose program index cannot be resolved', () => {
    const transaction = EXPECTED_SEND_SPL_TOKEN_AND_CREATE_TOKEN_ACCOUNT_DATA;
    const [instruction] = transaction.transaction.message.instructions;
    assert(instruction);

    expect(() =>
      toIInstruction(
        { ...instruction, programIdIndex: 9999 },
        { ...transaction, meta: null },
      ),
    ).toThrow('Program address not found');
  });
});

describe('extractInstructionsFromBase64String', () => {
  let mockRpc: Rpc<SolanaRpcApi>;

  const {
    transactionMessageBase64Encoded,
    signedTransactionBase64Encoded,
    getMultipleAccountsResponse,
  } = MOCK_EXECUTION_SCENARIO_SEND_SPL_TOKEN;

  const expectedInstructionParseResults: InstructionParseResult[] = [
    {
      type: 'SetComputeUnitLimit',
      encoded: {
        programAddress: address('ComputeBudget111111111111111111111111111111'),
        data: new Uint8Array([2, 186, 18, 0, 0]),
        dataBase58: 'JqvQNT',
      },
      parsed: {
        programAddress: address('ComputeBudget111111111111111111111111111111'),
        data: {
          discriminator: 2,
          units: 4794,
        },
      },
    },
    {
      type: 'SetComputeUnitPrice',
      encoded: {
        programAddress: address('ComputeBudget111111111111111111111111111111'),
        data: new Uint8Array([3, 232, 3, 0, 0, 0, 0, 0, 0]),
        dataBase58: '3tGNFMqHiozw',
      },
      parsed: {
        programAddress: address('ComputeBudget111111111111111111111111111111'),
        data: {
          discriminator: 3,
          microLamports: 1000n,
        },
      },
    },
    {
      type: 'Transfer',
      encoded: {
        programAddress: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        accounts: [
          {
            address: address('G23tQHsbQuh3yqUBoyXDn3TwqEbbbUHAHEeUSvJaVRtA'),
            role: 1,
          },
          {
            address: address('CSq2wNLSpfKHCdL3E3k1iksbRXWjfnD87b9iy35nL8VP'),
            role: 1,
          },
          {
            address: address('BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP'),
            role: 3,
          },
        ],
        data: new Uint8Array([3, 232, 3, 0, 0, 0, 0, 0, 0]),
        dataBase58: '3tGNFMqHiozw',
      },
      parsed: {
        programAddress: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        accounts: {
          source: {
            address: address('G23tQHsbQuh3yqUBoyXDn3TwqEbbbUHAHEeUSvJaVRtA'),
            role: 1,
          },
          destination: {
            address: address('CSq2wNLSpfKHCdL3E3k1iksbRXWjfnD87b9iy35nL8VP'),
            role: 1,
          },
          authority: {
            address: address('BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP'),
            role: 3,
          },
        },
        data: {
          discriminator: 3,
          amount: 1000n,
        },
      },
    },
  ] as unknown as InstructionParseResult[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Errors, 'trackError').mockResolvedValue('tracked-error-id');
    mockRpc = {
      getLatestBlockhash: vi.fn().mockReturnValue({
        send: vi.fn(),
      }),
      getFeeForMessage: vi.fn().mockReturnValue({
        send: vi.fn(),
      }),
      getMultipleAccounts: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(getMultipleAccountsResponse?.result),
      }),
    } as unknown as Rpc<SolanaRpcApi>;
  });

  it(`successfully extracts instructions from a base64 encoded transaction message`, async () => {
    const result = await extractInstructionsFromUnknownBase64String(
      mockRpc,
      transactionMessageBase64Encoded,
    );

    expect(result).toStrictEqual(expectedInstructionParseResults);
  });

  it(`successfully extracts instructions from a base64 encoded transaction`, async () => {
    const result = await extractInstructionsFromUnknownBase64String(
      mockRpc,
      signedTransactionBase64Encoded,
    );

    expect(result).toStrictEqual(expectedInstructionParseResults);
  });

  it('returns unknown instructions without tracking unsupported program addresses', () => {
    const result = parseInstruction({
      programAddress: address('11111111111111111111111111111112'),
      accounts: [],
      data: new Uint8Array([1, 2, 3]),
    });

    expect(result).toStrictEqual({
      type: 'Unknown',
      encoded: expect.objectContaining({
        programAddress: address('11111111111111111111111111111112'),
        dataBase58: expect.any(String),
      }),
      parsed: null,
    });
    expect(trackError).not.toHaveBeenCalled();
  });

  it.each([
    {
      failure: 'instruction identification',
      programAddress: address('ComputeBudget111111111111111111111111111111'),
      data: new Uint8Array([255]),
    },
    {
      failure: 'instruction parsing',
      programAddress: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      data: new Uint8Array([3, 232, 3, 0, 0, 0, 0, 0, 0]),
    },
  ])(
    'still tracks $failure failures for supported programs',
    ({ programAddress, data }) => {
      const result = parseInstruction({
        programAddress,
        accounts: [],
        data,
      });

      expect(result).toStrictEqual({
        type: 'Unknown',
        encoded: expect.objectContaining({ programAddress, data }),
        parsed: null,
      });
      expect(trackError).toHaveBeenCalledTimes(1);
      expect(trackError).toHaveBeenCalledWith(expect.any(Error));
    },
  );
});
