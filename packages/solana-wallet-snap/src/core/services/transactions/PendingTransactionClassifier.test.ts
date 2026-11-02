import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { getTransferSolInstruction } from '@solana-program/system';
import { getTransferCheckedInstruction } from '@solana-program/token';
import type { Blockhash, Instruction } from '@solana/kit';
import { address as asAddress, compileTransaction, pipe } from '@solana/kit';
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { createNoopSigner } from '@solana/kit';

import type { AssetEntity } from '../../../entities';
import { KnownCaip19Id, Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import { mockLogger } from '../__mocks__/logger';
import { createMockConnection } from '../__mocks__/mockConnection';
import type { AssetsService } from '../assets';
import type { SolanaConnection } from '../connection';
import { PendingTransactionClassifier } from './PendingTransactionClassifier';

const SENDER = MOCK_SOLANA_KEYRING_ACCOUNT_0;
const RECIPIENT = 'DjQCsHnPBhDKVd9h2Cv21QNG3fHD6chNfFGcknRdHKKf';
const RECIPIENT_TOKEN_ACCOUNT = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const LIFETIME = {
  blockhash: '8HSvyvQvdRoFkCPnrtqF3dAS4SpPEbMKUVTdrK9auMR' as Blockhash,
  lastValidBlockHeight: 1000n,
} as const;

const buildBase64Transaction = (instruction: Instruction): string => {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(asAddress(SENDER.address), tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(LIFETIME, tx),
    (tx) => appendTransactionMessageInstruction(instruction, tx),
  );
  return fromTransactionToBase64String(compileTransaction(message));
};

describe('PendingTransactionClassifier', () => {
  const mockConnection = createMockConnection();
  const mockAssetsService = {
    getAccountAssetsByIDs: jest.fn(),
  } as unknown as AssetsService;

  const classifier = new PendingTransactionClassifier(
    mockConnection,
    mockAssetsService,
    mockLogger,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('classifies a native SOL transfer', async () => {
    const base64 = buildBase64Transaction(
      getTransferSolInstruction({
        amount: 1_500_000_000n, // 1.5 SOL
        destination: asAddress(RECIPIENT),
        source: createNoopSigner(asAddress(SENDER.address)),
      }),
    );

    const result = await classifier.classify(base64, SENDER, Network.Mainnet);

    expect(result).toStrictEqual({
      type: 'send',
      from: [
        {
          address: SENDER.address,
          assetId: KnownCaip19Id.SolMainnet,
          unit: 'SOL',
          amount: '1.5',
        },
      ],
      to: [
        {
          address: RECIPIENT,
          assetId: KnownCaip19Id.SolMainnet,
          unit: 'SOL',
          amount: '1.5',
        },
      ],
    });
  });

  it('classifies a token transferChecked, resolving the recipient owner', async () => {
    jest.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
      [KnownCaip19Id.UsdcMainnet]: { symbol: 'USDC' } as AssetEntity,
    });
    jest.spyOn(mockConnection, 'getRpc').mockReturnValue({
      getAccountInfo: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({
          value: { data: { parsed: { info: { owner: RECIPIENT } } } },
        }),
      }),
    } as unknown as ReturnType<SolanaConnection['getRpc']>);

    const base64 = buildBase64Transaction(
      getTransferCheckedInstruction({
        source: asAddress(SENDER.address),
        mint: asAddress(USDC_MINT),
        destination: asAddress(RECIPIENT_TOKEN_ACCOUNT),
        authority: asAddress(SENDER.address),
        amount: 3_250_000n, // 3.25 USDC (6 decimals)
        decimals: 6,
      }),
    );

    const result = await classifier.classify(base64, SENDER, Network.Mainnet);

    expect(result).toStrictEqual({
      type: 'send',
      from: [
        {
          address: SENDER.address,
          assetId: KnownCaip19Id.UsdcMainnet,
          unit: 'USDC',
          amount: '3.25',
        },
      ],
      to: [
        {
          address: RECIPIENT,
          assetId: KnownCaip19Id.UsdcMainnet,
          unit: 'USDC',
          amount: '3.25',
        },
      ],
    });
  });

  it('omits the recipient when the token account owner cannot be resolved', async () => {
    jest.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
      [KnownCaip19Id.UsdcMainnet]: { symbol: 'USDC' } as AssetEntity,
    });
    jest.spyOn(mockConnection, 'getRpc').mockReturnValue({
      getAccountInfo: jest.fn().mockReturnValue({
        send: jest.fn().mockRejectedValue(new Error('rpc down')),
      }),
    } as unknown as ReturnType<SolanaConnection['getRpc']>);

    const base64 = buildBase64Transaction(
      getTransferCheckedInstruction({
        source: asAddress(SENDER.address),
        mint: asAddress(USDC_MINT),
        destination: asAddress(RECIPIENT_TOKEN_ACCOUNT),
        authority: asAddress(SENDER.address),
        amount: 3_250_000n,
        decimals: 6,
      }),
    );

    const result = await classifier.classify(base64, SENDER, Network.Mainnet);

    expect(result?.from).toHaveLength(1);
    expect(result?.to).toStrictEqual([]);
  });

  it('skips instructions it cannot parse and still classifies the transfer', async () => {
    const transfer = getTransferSolInstruction({
      amount: 1_500_000_000n,
      destination: asAddress(RECIPIENT),
      source: createNoopSigner(asAddress(SENDER.address)),
    });
    const unknownInstruction = {
      programAddress: asAddress('4MangoMJqJ2firMokCjjGgoK8d4MXf8LGSMTkXM98hvM'),
      accounts: [],
      data: new Uint8Array([1, 2, 3]),
    } as unknown as Instruction;

    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(asAddress(SENDER.address), tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(LIFETIME, tx),
      (tx) => appendTransactionMessageInstruction(unknownInstruction, tx),
      (tx) => appendTransactionMessageInstruction(transfer, tx),
    );
    const base64 = fromTransactionToBase64String(compileTransaction(message));

    const result = await classifier.classify(base64, SENDER, Network.Mainnet);

    expect(result?.type).toBe('send');
    expect(result?.to).toHaveLength(1);
  });

  it('falls back to an empty unit when asset metadata cannot be resolved', async () => {
    jest
      .spyOn(mockAssetsService, 'getAccountAssetsByIDs')
      .mockRejectedValue(new Error('assets unavailable'));
    jest.spyOn(mockConnection, 'getRpc').mockReturnValue({
      getAccountInfo: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({
          value: { data: { parsed: { info: { owner: RECIPIENT } } } },
        }),
      }),
    } as unknown as ReturnType<SolanaConnection['getRpc']>);

    const base64 = buildBase64Transaction(
      getTransferCheckedInstruction({
        source: asAddress(SENDER.address),
        mint: asAddress(USDC_MINT),
        destination: asAddress(RECIPIENT_TOKEN_ACCOUNT),
        authority: asAddress(SENDER.address),
        amount: 3_250_000n,
        decimals: 6,
      }),
    );

    const result = await classifier.classify(base64, SENDER, Network.Mainnet);

    expect(result?.from[0]).toStrictEqual({
      address: SENDER.address,
      assetId: KnownCaip19Id.UsdcMainnet,
      unit: '',
      amount: '3.25',
    });
  });

  it('returns undefined for non-transfer transactions', async () => {
    const base64 = buildBase64Transaction(
      // A compute-budget instruction carries no movements.
      getSetComputeUnitLimitInstruction({ units: 200_000 }),
    );

    const result = await classifier.classify(base64, SENDER, Network.Mainnet);

    expect(result).toBeUndefined();
  });
});
