/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { Transaction } from '@metamask/keyring-api';
import * as KeyringSnapSdk from '@metamask/keyring-snap-sdk';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { address as asAddress } from '@solana/kit';
import type { NativeAsset, TokenAsset } from 'src/entities';

import { KnownCaip19Id, Network } from '../../constants/solana';
import {
  MOCK_SOLANA_KEYRING_ACCOUNT_0,
  MOCK_SOLANA_KEYRING_ACCOUNT_1,
} from '../../test/mocks/solana-keyring-accounts';
import { MOCK_GET_SIGNATURES_FOR_ADDRESS } from '../../test/mocks/transactions';
import { ADDRESS_1_TRANSACTION_1_DATA } from '../../test/mocks/transactions-data/address-1/transaction-1';
import * as Errors from '../../utils/errors';
import { trackError } from '../../utils/errors';
import { createMockConnection } from '../__mocks__/mockConnection';
import type { AccountsService } from '../accounts/AccountsService';
import type { AssetsService } from '../assets/AssetsService';
import type { SolanaConnection } from '../connection/SolanaConnection';
import type { TransactionMapper } from './TransactionMapper';
import type { TransactionsRepository } from './TransactionsRepository';
import { TransactionsService } from './TransactionsService';

const MOCK_TOKEN_ACCOUNT_RESPONSE = {
  account: {
    data: {
      parsed: {
        info: {
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        },
      },
    },
  },
  pubkey: asAddress('9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg'),
};

describe('TransactionsService', () => {
  let mockTransactionsRepository: TransactionsRepository;
  let mockTransactionMapper: TransactionMapper;
  let mockAccountsService: AccountsService;
  let mockConnection: SolanaConnection;
  let mockAssetsService: AssetsService;
  let service: TransactionsService;

  beforeEach(() => {
    vi.spyOn(KeyringSnapSdk, 'emitSnapKeyringEvent').mockResolvedValue(
      undefined,
    );
    vi.spyOn(Errors, 'trackError').mockResolvedValue('tracked-error-id');
    mockTransactionsRepository = {
      findByAccountId: vi.fn(),
      getAll: vi.fn(),
      saveMany: vi.fn(),
    } as unknown as TransactionsRepository;

    mockTransactionMapper = {
      mapRpcTransaction: vi.fn(),
    } as unknown as TransactionMapper;

    mockAssetsService = {
      getAssetsMetadata: vi.fn(),
    } as unknown as AssetsService;

    mockConnection = createMockConnection();

    mockAccountsService = {
      getAll: vi.fn(),
    } as unknown as AccountsService;

    service = new TransactionsService(
      mockTransactionsRepository,
      mockTransactionMapper,
      mockAccountsService,
      mockAssetsService,
      mockConnection,
    );

    const snap = {
      request: vi.fn(),
    };
    (globalThis as any).snap = snap;
  });

  describe('fetchBySignature', () => {
    const mockAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;
    const mockScope = Network.Mainnet;
    const mockTransactionData = ADDRESS_1_TRANSACTION_1_DATA;
    const mockMappedTransaction = {} as unknown as Transaction;
    const mockSignature = mockTransactionData.transaction.signatures[1]!;

    it('fetches and returns a transaction by signature', async () => {
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getTransaction: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue(mockTransactionData),
        }),
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      vi.spyOn(mockTransactionMapper, 'mapRpcTransaction').mockResolvedValue(
        mockMappedTransaction,
      );

      const result = await service.fetchBySignature(
        mockSignature,
        mockAccount,
        mockScope,
      );

      expect(result).toStrictEqual(mockMappedTransaction);
    });

    it('returns null if the transaction is not found', async () => {
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getTransaction: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue(null),
        }),
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      const result = await service.fetchBySignature(
        mockSignature,
        mockAccount,
        mockScope,
      );

      expect(result).toBeNull();
    });
  });

  describe('fetchLatestSignatures', () => {
    it('fetches and returns signatures for the given address', async () => {
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getSignaturesForAddress: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue(MOCK_GET_SIGNATURES_FOR_ADDRESS),
        }),
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      const result = await service.fetchLatestSignatures(
        Network.Localnet,
        asAddress('BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP'),
        { limit: 10 },
      );

      expect(result).toStrictEqual([
        '3B7H4E2ih3Tcas6um1izEBZagVfLoxSUfZSKkSNSu7mh4nAy7ZafaEgKhH4d1NBY2MMRWgyPX2LcMbKYwphR8dRq',
        '3Zj5XkvE1Uec1frjue6SK2ND2cqhKPvPkZ1ZFPwo2v9iL4NX4b4WWG1wPNEQdnJJU8sVx7MMHjSH1HxoR21vEjoV',
        '2qfNzGs15dt999rt1AUJ7D1oPQaukMPPmHR2u5ZmDo4cVtr1Pr2Dax4Jo7ryTpM8jxjtXLi5NHy4uyr68MVh5my6',
        '54Lz5p2zQNU6ngvyGtpeMYEdGoHG2D7ByPS2n3Wa4QNHzqTZ46sUemk1PxSrM6UieQ2i15XiRrTuxZyiPkg8V1vW',
        '2a5UXcyb6Gz8DH5MdumBvoGQiHLjTKfPcKrAGcsPrVSUjM9NRVUB1TuL1sNEj59nKBzfLm3Z2RvtsnCGZHa7KXPB',
        'yftYXx1xSmLiMeJ2mGkpZd7Xd13mtW7juWcRnihMhDz1zAeCrq5rPrw7WoCkhEcfUL7MwYCti9Q8bWRdJKZuris',
        '24pkWA6oUqtKs1nqx4ZFqW3DoeNcVHC57s1azr63EzaXsDNJAkejmyjB7QonVqvm3cC8cVtbN11jSWTu1xUurQZ9',
        '27kCW7f9RCWDkQSqSDrwvbJ3d8mgaFmLLu7GsVujJnp55ue8mQNHvphoVEEF32mXUWZSagdXNraZ7zszBENgAY7T',
        '5XpBS9D4bBhc4F69SJd3th19Xe8qhqPyJ3MKWhRLF3tbeHTbSLZSM9UUztJc7pLTASUd2jNR67y2W3Q6LogUnai7',
        '5iFQpCwAgiXebzuKxLfhePscR9EYRvRNRSx2Mbj12ed36zNkGmQMkg7ekFXjh88R3p75D6uNK45hgRxC6FyUDnhE',
      ]);
    });
  });

  describe('findByAccounts', () => {
    it('fetches and returns transactions for the given accounts', async () => {
      const mockAccount0 = MOCK_SOLANA_KEYRING_ACCOUNT_0;
      const mockAccount1 = MOCK_SOLANA_KEYRING_ACCOUNT_1;

      const mockTransaction00 = {} as unknown as Transaction;
      const mockTransaction01 = {} as unknown as Transaction;
      const mockTransaction10 = {} as unknown as Transaction;

      vi.spyOn(mockTransactionsRepository, 'findByAccountId')
        .mockResolvedValueOnce([mockTransaction00, mockTransaction01])
        .mockResolvedValueOnce([mockTransaction10]);

      const result = await service.findByAccounts([mockAccount0, mockAccount1]);

      expect(result).toStrictEqual([
        mockTransaction00,
        mockTransaction01,
        mockTransaction10,
      ]);
    });
  });

  describe('fetchAssetsTransactions', () => {
    it('tracks transaction fetch errors and continues', async () => {
      const asset = {
        assetType: KnownCaip19Id.SolMainnet,
        keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        network: Network.Mainnet,
        address: MOCK_SOLANA_KEYRING_ACCOUNT_0.address,
        symbol: 'SOL',
        decimals: 9,
        rawAmount: '1',
        uiAmount: '1',
      } as NativeAsset;
      const error = new Error('RPC failed');

      vi.spyOn(mockAccountsService, 'getAll').mockResolvedValue([
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      ]);
      vi.spyOn(mockAssetsService, 'getAssetsMetadata').mockResolvedValue({});
      vi.spyOn(mockTransactionsRepository, 'getAll').mockResolvedValue([]);
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getSignaturesForAddress: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue([MOCK_GET_SIGNATURES_FOR_ADDRESS[0]]),
        }),
        getTransaction: vi.fn().mockReturnValue({
          send: vi.fn().mockRejectedValue(error),
        }),
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      expect(await service.fetchAssetsTransactions([asset])).toStrictEqual([]);
      expect(trackError).toHaveBeenCalledTimes(1);
      expect(trackError).toHaveBeenCalledWith(error);
    });

    it('fetches signatures for every token account, including non-ATA accounts', async () => {
      const asset: TokenAsset = {
        assetType: KnownCaip19Id.UsdcMainnet,
        keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        network: Network.Mainnet,
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        decimals: 6,
        rawAmount: '1',
        uiAmount: '0.000001',
      };
      const ata = '9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg';
      const nonAta = '7Gg2Y8vCj3v5nQj5xFfC3uT7wJ9sN4mK2pL8rH6dQ1eA';
      const signature = MOCK_GET_SIGNATURES_FOR_ADDRESS[0]!;
      const getSignaturesForAddress = vi.fn((address: string) => ({
        send: vi.fn().mockResolvedValue(
          address === nonAta
            ? [
                {
                  ...signature,
                  signature: 'non-ata-signature',
                },
              ]
            : [],
        ),
      }));

      vi.spyOn(mockAccountsService, 'getAll').mockResolvedValue([
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      ]);
      vi.spyOn(mockAssetsService, 'getAssetsMetadata').mockResolvedValue({});
      vi.spyOn(mockTransactionsRepository, 'getAll').mockResolvedValue([]);
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getTokenAccountsByOwner: vi.fn(
          (_owner: string, filter: { programId: string }) => ({
            send: vi.fn().mockResolvedValue({
              value:
                filter.programId === TOKEN_PROGRAM_ADDRESS
                  ? [
                      {
                        ...MOCK_TOKEN_ACCOUNT_RESPONSE,
                        pubkey: asAddress(ata),
                      },
                      {
                        ...MOCK_TOKEN_ACCOUNT_RESPONSE,
                        pubkey: asAddress(nonAta),
                      },
                    ]
                  : [],
            }),
          }),
        ),
        getSignaturesForAddress,
        getTransaction: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue(null),
        }),
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      await service.fetchAssetsTransactions([asset]);

      expect(getSignaturesForAddress).toHaveBeenCalledTimes(2);
      expect(getSignaturesForAddress).toHaveBeenCalledWith(ata, {
        limit: 5,
      });
      expect(getSignaturesForAddress).toHaveBeenCalledWith(nonAta, {
        limit: 5,
      });
    });

    it('continues when one token program request fails', async () => {
      const asset: TokenAsset = {
        assetType: KnownCaip19Id.UsdcMainnet,
        keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        network: Network.Mainnet,
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        decimals: 6,
        rawAmount: '1',
        uiAmount: '0.000001',
      };
      const tokenAccount = '9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg';
      const getSignaturesForAddress = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue([]),
      });

      vi.spyOn(mockAccountsService, 'getAll').mockResolvedValue([
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      ]);
      vi.spyOn(mockAssetsService, 'getAssetsMetadata').mockResolvedValue({});
      vi.spyOn(mockTransactionsRepository, 'getAll').mockResolvedValue([]);
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getTokenAccountsByOwner: vi.fn(
          (_owner: string, filter: { programId: string }) => ({
            send:
              filter.programId === TOKEN_PROGRAM_ADDRESS
                ? vi.fn().mockResolvedValue({
                    value: [
                      {
                        ...MOCK_TOKEN_ACCOUNT_RESPONSE,
                        pubkey: asAddress(tokenAccount),
                      },
                    ],
                  })
                : vi.fn().mockRejectedValue(new Error('Token-2022 failed')),
          }),
        ),
        getSignaturesForAddress,
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      expect(await service.fetchAssetsTransactions([asset])).toStrictEqual([]);
      expect(getSignaturesForAddress).toHaveBeenCalledWith(tokenAccount, {
        limit: 5,
      });
      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Token-2022 failed' }),
      );
    });

    it('queries Token-2022 token accounts as well', async () => {
      const asset: TokenAsset = {
        assetType: KnownCaip19Id.UsdcMainnet,
        keyringAccountId: MOCK_SOLANA_KEYRING_ACCOUNT_0.id,
        network: Network.Mainnet,
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        decimals: 6,
        rawAmount: '1',
        uiAmount: '0.000001',
      };
      const token2022Account = '7Gg2Y8vCj3v5nQj5xFfC3uT7wJ9sN4mK2pL8rH6dQ1eA';
      const getTokenAccountsByOwner = vi.fn(
        (_owner: string, filter: { programId: string }) => ({
          send: vi.fn().mockResolvedValue({
            value:
              filter.programId === TOKEN_2022_PROGRAM_ADDRESS
                ? [
                    {
                      ...MOCK_TOKEN_ACCOUNT_RESPONSE,
                      pubkey: asAddress(token2022Account),
                    },
                  ]
                : [],
          }),
        }),
      );

      vi.spyOn(mockAccountsService, 'getAll').mockResolvedValue([
        MOCK_SOLANA_KEYRING_ACCOUNT_0,
      ]);
      vi.spyOn(mockAssetsService, 'getAssetsMetadata').mockResolvedValue({});
      vi.spyOn(mockTransactionsRepository, 'getAll').mockResolvedValue([]);
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getTokenAccountsByOwner,
        getSignaturesForAddress: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<SolanaConnection['getRpc']>);

      await service.fetchAssetsTransactions([asset]);

      expect(getTokenAccountsByOwner).toHaveBeenCalledWith(
        asAddress(MOCK_SOLANA_KEYRING_ACCOUNT_0.address),
        { programId: TOKEN_PROGRAM_ADDRESS },
        { encoding: 'jsonParsed' },
      );
      expect(getTokenAccountsByOwner).toHaveBeenCalledWith(
        asAddress(MOCK_SOLANA_KEYRING_ACCOUNT_0.address),
        { programId: TOKEN_2022_PROGRAM_ADDRESS },
        { encoding: 'jsonParsed' },
      );
    });
  });

  describe('save', () => {
    it('saves a transaction', async () => {
      const mockTransaction = {} as unknown as Transaction;

      await service.save(mockTransaction);

      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith([
        mockTransaction,
      ]);
    });
  });

  describe('saveMany', () => {
    it('saves multiple transactions', async () => {
      const transactions = [
        {} as unknown as Transaction,
        {} as unknown as Transaction,
      ];

      await service.saveMany(transactions);

      expect(mockTransactionsRepository.saveMany).toHaveBeenCalledWith(
        transactions,
      );
    });
  });
});
