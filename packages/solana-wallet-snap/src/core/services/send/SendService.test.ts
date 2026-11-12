import { SolMethod } from '@metamask/keyring-api';
import {
  DEFAULT_METAMASK_ORIGIN,
  InMemoryCache,
} from '@metamask/snap-networks-utils';
import type {
  ExtendedKeyringAccount,
  ICache,
  Serializable,
} from '@metamask/snap-networks-utils';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import { address, lamports } from '@solana/kit';
import * as SolanaKit from '@solana/kit';
import type { Mock } from 'vitest';

import type { AssetEntity } from '../../../entities';
import { KnownCaip19Id, Network, Networks } from '../../constants/solana';
import { ClientRequestMethod } from '../../handlers/onClientRequest/types';
import type { SolanaKeyring } from '../../handlers/onKeyringRequest/Keyring';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import * as Codecs from '../../sdk-extensions/codecs';
import {
  MOCK_SOLANA_KEYRING_ACCOUNT_0,
  MOCK_SOLANA_KEYRING_ACCOUNT_1,
} from '../../test/mocks/solana-keyring-accounts';
import { mockLogger } from '../__mocks__/logger';
import { createMockConnection } from '../__mocks__/mockConnection';
import { MOCK_MINT_ACCOUNT } from '../__mocks__/mockSolanaRpcResponses';
import type { AssetsService } from '../assets';
import type { SolanaConnection } from '../connection';
import type { RecipientClassifier } from './RecipientClassifier';
import { SendService } from './SendService';
import type { SendSolBuilder } from './SendSolBuilder';
import { SendSplTokenBuilder } from './SendSplTokenBuilder';
import { SendErrorCodes } from './types';
import type {
  GetMaxSendableAmountRequest,
  OnAmountInputRequest,
  OnConfirmSendRequest,
} from './types';

describe('SendService', () => {
  let sendService: SendService;
  let mockConnection: SolanaConnection;
  let mockKeyring: SolanaKeyring;
  let mockCache: ICache<Serializable>;
  let mockSendSolBuilder: SendSolBuilder;
  let mockSendSplTokenBuilder: SendSplTokenBuilder;
  let mockAssetsService: AssetsService;
  let mockRecipientClassifier: RecipientClassifier;

  const mockAccount: ExtendedKeyringAccount = MOCK_SOLANA_KEYRING_ACCOUNT_0;

  const mockRecipientAtaAccount = (exists: boolean): void => {
    vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue({
      exists,
    } as unknown as Awaited<
      ReturnType<SolanaConnection['fetchJsonParsedAccount']>
    >);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'test-uuid' as ReturnType<typeof globalThis.crypto.randomUUID>,
    );
    vi.spyOn(Codecs, 'fromTransactionToBase64String');
    vi.spyOn(SolanaKit, 'compileTransaction').mockReturnValue({
      message: {
        version: 0,
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 0,
        },
        staticAccounts: [],
        compiledInstructions: [],
        addressTableLookups: [],
      },
    } as never);

    mockConnection = createMockConnection();
    mockCache = new InMemoryCache(mockLogger);

    vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
      getMinimumBalanceForRentExemption: vi
        .fn()
        .mockImplementation((dataLength: bigint) => ({
          send: vi
            .fn()
            .mockResolvedValue(
              lamports(dataLength === 0n ? 1000000n : 2000000n),
            ),
        })),
    } as any);

    mockKeyring = {
      getAccountOrThrow: vi.fn().mockResolvedValue(mockAccount),
      submitRequest: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as SolanaKeyring;

    mockRecipientClassifier = {
      classify: vi.fn().mockResolvedValue({ type: 'SYSTEM' }),
    } as unknown as RecipientClassifier;

    mockSendSolBuilder = {
      buildTransactionMessage: vi.fn().mockResolvedValue({} as any),
      getComputeUnitLimit: vi.fn().mockReturnValue(200000),
      getComputeUnitPriceMicroLamportsPerComputeUnit: vi
        .fn()
        .mockReturnValue(1000n),
    } as unknown as SendSolBuilder;

    mockSendSplTokenBuilder = {
      buildTransactionMessage: vi.fn().mockResolvedValue({} as any),
      getComputeUnitLimit: vi.fn().mockReturnValue(200000),
      getComputeUnitPriceMicroLamportsPerComputeUnit: vi
        .fn()
        .mockReturnValue(1000n),
    } as unknown as SendSplTokenBuilder;

    mockAssetsService = {
      getAccountAssetsByIDs: vi.fn(),
    } as unknown as AssetsService;

    (fromTransactionToBase64String as Mock).mockReturnValue(
      'base64-encoded-tx',
    );

    sendService = new SendService(
      mockConnection,
      mockKeyring,
      mockLogger,
      mockCache,
      mockRecipientClassifier,
      mockSendSolBuilder,
      mockSendSplTokenBuilder,
      mockAssetsService,
    );
  });

  describe('confirmSend', () => {
    const mockRequest: OnConfirmSendRequest = {
      jsonrpc: '2.0',
      id: '1',
      method: ClientRequestMethod.ConfirmSend,
      params: {
        fromAccountId: mockAccount.id,
        toAddress: MOCK_SOLANA_KEYRING_ACCOUNT_1.address,
        amount: '1.5',
        assetId: Networks[Network.Mainnet].nativeToken.caip19Id,
      },
    };

    it('confirms native SOL send transaction successfully', async () => {
      const result = await sendService.confirmSend(mockRequest);

      expect(mockKeyring.getAccountOrThrow).toHaveBeenCalledWith(
        mockAccount.id,
      );
      expect(mockSendSolBuilder.buildTransactionMessage).toHaveBeenCalledWith({
        from: mockAccount,
        to: MOCK_SOLANA_KEYRING_ACCOUNT_1.address,
        amount: '1.5',
        network: Network.Mainnet,
      });
      expect(mockKeyring.submitRequest).toHaveBeenCalledWith({
        id: globalThis.crypto.randomUUID(),
        scope: Network.Mainnet,
        account: mockAccount.id,
        origin: DEFAULT_METAMASK_ORIGIN,
        request: {
          method: SolMethod.SignAndSendTransaction,
          params: {
            account: { address: mockAccount.address },
            transaction: 'base64-encoded-tx',
            scope: Network.Mainnet,
          },
        },
      });
      expect(result).toStrictEqual({ success: true });
    });

    it('confirms SPL token send transaction successfully', async () => {
      const tokenRequest: OnConfirmSendRequest = {
        ...mockRequest,
        params: {
          ...mockRequest.params,
          assetId: KnownCaip19Id.UsdcMainnet,
        },
      };

      const result = await sendService.confirmSend(tokenRequest);

      expect(
        mockSendSplTokenBuilder.buildTransactionMessage,
      ).toHaveBeenCalledWith({
        from: mockAccount,
        to: MOCK_SOLANA_KEYRING_ACCOUNT_1.address,
        amount: '1.5',
        network: Network.Mainnet,
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      });
      expect(result).toStrictEqual({ success: true });
    });

    it('handles errors from keyring.getAccountOrThrow', async () => {
      const error = new Error('Account not found');
      vi.spyOn(mockKeyring, 'getAccountOrThrow').mockRejectedValue(error);

      await expect(sendService.confirmSend(mockRequest)).rejects.toThrow(
        'Account not found',
      );
    });

    it('handles errors from builder.buildTransactionMessage', async () => {
      const error = new Error('Failed to build transaction');
      vi.spyOn(mockSendSolBuilder, 'buildTransactionMessage').mockRejectedValue(
        error,
      );

      await expect(sendService.confirmSend(mockRequest)).rejects.toThrow(
        'Failed to build transaction',
      );
    });

    it('handles errors from keyring.submitRequest', async () => {
      const error = new Error('Failed to submit request');
      vi.spyOn(mockKeyring, 'submitRequest').mockRejectedValue(error);

      await expect(sendService.confirmSend(mockRequest)).rejects.toThrow(
        'Failed to submit request',
      );
    });
  });

  describe('onAddressInput', () => {
    it('validates valid address successfully', async () => {
      const value = MOCK_SOLANA_KEYRING_ACCOUNT_1.address;
      const scope = Network.Mainnet;

      const result = await sendService.onAddressInput(value, scope);

      expect(result.valid).toBe(true);
      expect(result.errors).toStrictEqual([]);
    });

    it('rejects empty address', async () => {
      const value = '';
      const scope = Network.Mainnet;

      const result = await sendService.onAddressInput(value, scope);

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([{ code: SendErrorCodes.Required }]);
    });

    it('rejects invalid address', async () => {
      const value = 'invalid-address';
      const scope = Network.Mainnet;

      const result = await sendService.onAddressInput(value, scope);

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([{ code: SendErrorCodes.Invalid }]);
    });

    it('handles null/undefined address', async () => {
      const value = null as any;
      const scope = Network.Mainnet;

      const result = await sendService.onAddressInput(value, scope);

      expect(result.valid).toBe(false);
      expect(result.errors).toStrictEqual([{ code: SendErrorCodes.Invalid }]);
    });
  });

  describe('onAmountInput', () => {
    const mockRequest: OnAmountInputRequest = {
      jsonrpc: '2.0',
      id: '1',
      method: ClientRequestMethod.OnAmountInput,
      params: {
        value: '1.5',
        accountId: mockAccount.id,
        assetId: Networks[Network.Mainnet].nativeToken.caip19Id,
      },
    };

    const mockAssetBalances: AssetEntity[] = [
      {
        assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
        uiAmount: '10.0',
        keyringAccountId: mockAccount.id,
        network: Network.Mainnet,
        address: mockAccount.address,
        symbol: Networks[Network.Mainnet].nativeToken.symbol,
        decimals: Networks[Network.Mainnet].nativeToken.decimals,
        rawAmount: '10000000000',
      },
    ];

    beforeEach(() => {
      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockImplementation(
        async (_accountId, assetIds) =>
          Object.fromEntries(
            assetIds.map((assetId) => [
              assetId,
              mockAssetBalances.find((asset) => asset.assetType === assetId) ??
                null,
            ]),
          ),
      );

      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getMinimumBalanceForRentExemption: vi
          .fn()
          .mockImplementation((dataLength: bigint) => ({
            send: vi
              .fn()
              .mockResolvedValue(
                lamports(dataLength === 0n ? 1000000n : 2000000n),
              ),
          })),
      } as any);
    });

    it('validates valid native SOL amount successfully', async () => {
      const result = await sendService.onAmountInput(mockRequest);

      expect(result).toStrictEqual({
        valid: true,
        errors: [],
      });
    });

    it('rejects empty amount', async () => {
      const emptyRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: { ...mockRequest.params, value: '' },
      };

      const result = await sendService.onAmountInput(emptyRequest);

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.Required }],
      });
    });

    it('rejects when asset balance not found', async () => {
      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [mockRequest.params.assetId]: null,
        [Networks[Network.Mainnet].nativeToken.caip19Id]: null,
      });

      await expect(sendService.onAmountInput(mockRequest)).rejects.toThrow(
        `Balance not found for asset ${mockRequest.params.assetId} and account ${mockAccount.id}`,
      );
    });

    it('rejects when native SOL balance is insufficient for rent exemption', async () => {
      const lowBalanceRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: { ...mockRequest.params, value: '0.000001' },
      };

      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [Networks[Network.Mainnet].nativeToken.caip19Id]: {
          assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
          uiAmount: '0.00001',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '999999999999999999',
        },
        [mockRequest.params.assetId]: {
          assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
          uiAmount: '0.00001',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '999999999999999999',
        },
      });

      const result = await sendService.onAmountInput(lowBalanceRequest);

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
      });
    });

    it('rejects when native SOL amount exceeds balance', async () => {
      const highAmountRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: { ...mockRequest.params, value: '15.0' }, // More than 10.0 balance
      };

      const result = await sendService.onAmountInput(highAmountRequest);

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalance }],
      });
    });

    it('rejects when native SOL amount within balance but insufficient for fees and rent', async () => {
      const highAmountRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: { ...mockRequest.params, value: '9.999999999' },
      };

      const result = await sendService.onAmountInput(highAmountRequest);

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
      });
    });

    it('rejects when value is greater than asset balance', async () => {
      const zeroBalanceRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: {
          ...mockRequest.params,
          assetId: KnownCaip19Id.UsdcMainnet,
          value: '0.1',
        },
      };

      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [Networks[Network.Mainnet].nativeToken.caip19Id]: {
          assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
          uiAmount: '0.1',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '10000000000',
        },
        [KnownCaip19Id.UsdcMainnet]: {
          assetType: KnownCaip19Id.UsdcMainnet,
          uiAmount: '0.001',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          mint: 'token-address-123',
          symbol: 'USDC',
          decimals: 6,
          rawAmount: '1000000',
        },
      });

      const result = await sendService.onAmountInput(zeroBalanceRequest);

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalance }],
      });
    });

    it('rejects when native SOL balance is zero', async () => {
      const zeroSolRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: { ...mockRequest.params, value: '0.1' },
      };

      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [Networks[Network.Mainnet].nativeToken.caip19Id]: {
          assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
          uiAmount: '0',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '0',
        },
        [mockRequest.params.assetId]: {
          assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
          uiAmount: '0',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '0',
        },
      });

      const result = await sendService.onAmountInput(zeroSolRequest);

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalance }],
      });
    });

    it('validates SPL token amount successfully', async () => {
      const tokenRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: {
          ...mockRequest.params,
          assetId: KnownCaip19Id.UsdcMainnet,
        },
      };

      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [KnownCaip19Id.UsdcMainnet]: {
          assetType: KnownCaip19Id.UsdcMainnet,
          uiAmount: '100.0',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          mint: 'token-address-123',
          symbol: 'USDC',
          decimals: 6,
          rawAmount: '100000000000',
        },
        [Networks[Network.Mainnet].nativeToken.caip19Id]: {
          assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
          uiAmount: '1.0',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '10000000000',
        },
      });

      const result = await sendService.onAmountInput(tokenRequest);

      expect(result).toStrictEqual({
        valid: true,
        errors: [],
      });
    });

    it('rejects SPL token when SOL balance is insufficient for fee and rent', async () => {
      const tokenRequest: OnAmountInputRequest = {
        ...mockRequest,
        params: {
          ...mockRequest.params,
          assetId: KnownCaip19Id.UsdcMainnet,
        },
      };

      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [KnownCaip19Id.UsdcMainnet]: {
          assetType: KnownCaip19Id.UsdcMainnet,
          uiAmount: '100.0',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          mint: 'token-address-123',
          symbol: 'USDC',
          decimals: 6,
          rawAmount: '100000000000',
        },
        [Networks[Network.Mainnet].nativeToken.caip19Id]: {
          assetType: Networks[Network.Mainnet].nativeToken.caip19Id,
          uiAmount: '0.0001',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '10000000000',
        },
      });

      const result = await sendService.onAmountInput(tokenRequest);

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
      });
    });

    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const nativeAssetId = Networks[Network.Mainnet].nativeToken.caip19Id;

    const mockSplBalances = (nativeUiAmount: string): void => {
      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [KnownCaip19Id.UsdcMainnet]: {
          assetType: KnownCaip19Id.UsdcMainnet,
          uiAmount: '100.0',
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          mint: usdcMint,
          symbol: 'USDC',
          decimals: 6,
          rawAmount: '100000000000',
        },
        [nativeAssetId]: {
          assetType: nativeAssetId,
          uiAmount: nativeUiAmount,
          keyringAccountId: mockAccount.id,
          network: Network.Mainnet,
          address: mockAccount.address,
          symbol: Networks[Network.Mainnet].nativeToken.symbol,
          decimals: Networks[Network.Mainnet].nativeToken.decimals,
          rawAmount: '0',
        },
      });
    };

    const splRequest = (requestToAddress?: string): OnAmountInputRequest => ({
      ...mockRequest,
      params: {
        ...mockRequest.params,
        assetId: KnownCaip19Id.UsdcMainnet,
        ...(requestToAddress ? { toAddress: requestToAddress } : {}),
      },
    });

    it('requires ATA rent for SPL when toAddress is omitted', async () => {
      mockSplBalances('0.0011');

      const result = await sendService.onAmountInput(splRequest());

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
      });
    });

    it('requires ATA rent for SPL when the recipient has no ATA', async () => {
      mockSplBalances('0.0011');

      const result = await sendService.onAmountInput(
        splRequest(MOCK_SOLANA_KEYRING_ACCOUNT_1.address),
      );

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.InsufficientBalanceToCoverFee }],
      });
    });

    it('skips ATA rent for SPL when the recipient ATA already exists', async () => {
      mockSplBalances('0.0011');
      mockRecipientAtaAccount(true);

      const result = await sendService.onAmountInput(
        splRequest(MOCK_SOLANA_KEYRING_ACCOUNT_1.address),
      );

      expect(result).toStrictEqual({
        valid: true,
        errors: [],
      });
    });

    it('skips ATA rent for SPL when sending directly to a token account', async () => {
      mockSplBalances('0.0011');
      vi.spyOn(mockRecipientClassifier, 'classify').mockResolvedValue({
        type: 'TOKEN_ACCOUNT',
        mint: address(usdcMint),
      });

      const result = await sendService.onAmountInput(
        splRequest(MOCK_SOLANA_KEYRING_ACCOUNT_1.address),
      );

      expect(result).toStrictEqual({
        valid: true,
        errors: [],
      });
    });

    it('rejects SPL sends to a token account for another mint', async () => {
      mockSplBalances('1.0');
      vi.spyOn(mockRecipientClassifier, 'classify').mockResolvedValue({
        type: 'TOKEN_ACCOUNT',
        mint: address('HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr'),
      });

      const result = await sendService.onAmountInput(
        splRequest(MOCK_SOLANA_KEYRING_ACCOUNT_1.address),
      );

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.Invalid }],
      });
    });

    it('rejects SPL sends to an unsupported recipient', async () => {
      mockSplBalances('1.0');
      vi.spyOn(mockRecipientClassifier, 'classify').mockResolvedValue({
        type: 'UNSUPPORTED',
      });

      const result = await sendService.onAmountInput(
        splRequest(MOCK_SOLANA_KEYRING_ACCOUNT_1.address),
      );

      expect(result).toStrictEqual({
        valid: false,
        errors: [{ code: SendErrorCodes.Invalid }],
      });
    });

    it('handles errors if account is not found', async () => {
      const error = new Error('Account not found');
      vi.spyOn(mockKeyring, 'getAccountOrThrow').mockRejectedValue(error);

      await expect(sendService.onAmountInput(mockRequest)).rejects.toThrow(
        'Account not found',
      );
    });

    it('handles errors if balances are not found', async () => {
      const error = new Error('Failed to fetch balances');
      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockRejectedValue(
        error,
      );

      await expect(sendService.onAmountInput(mockRequest)).rejects.toThrow(
        'Failed to fetch balances',
      );
    });

    it('handles errors if connection fails', async () => {
      const error = new Error('RPC connection failed');
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getMinimumBalanceForRentExemption: vi.fn().mockReturnValue({
          send: vi.fn().mockRejectedValue(error),
        }),
      } as any);

      await expect(sendService.onAmountInput(mockRequest)).rejects.toThrow(
        'RPC connection failed',
      );
    });
  });

  describe('getMaxSendableAmount', () => {
    const nativeAssetId = Networks[Network.Mainnet].nativeToken.caip19Id;
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const toAddress = MOCK_SOLANA_KEYRING_ACCOUNT_1.address;

    const createRequest = (
      assetId: GetMaxSendableAmountRequest['params']['assetId'],
      requestToAddress?: string,
    ): GetMaxSendableAmountRequest => ({
      jsonrpc: '2.0',
      id: '1',
      method: ClientRequestMethod.GetMaxSendableAmount,
      params: {
        accountId: mockAccount.id,
        assetId,
        ...(requestToAddress === undefined
          ? {}
          : { toAddress: requestToAddress }),
      },
    });

    const createAsset = (
      assetType: AssetEntity['assetType'],
      uiAmount: string,
    ): AssetEntity =>
      ({
        assetType,
        uiAmount,
        keyringAccountId: mockAccount.id,
        network: Network.Mainnet,
        symbol: 'MOCK',
        decimals: 6,
        rawAmount: '0',
      }) as AssetEntity;

    const mockBalances = (
      asset: AssetEntity | null,
      nativeAsset: AssetEntity | null,
    ): void => {
      vi.spyOn(mockAssetsService, 'getAccountAssetsByIDs').mockResolvedValue({
        [asset?.assetType ?? nativeAssetId]: asset,
        [nativeAssetId]: nativeAsset,
      });
    };

    it('returns the maximum SOL leaving the fee and rent exemption', async () => {
      // Fee: 5000 base + 200 priority = 5200 lamports.
      // Rent exemption: 1000000 lamports.
      mockBalances(
        createAsset(nativeAssetId, '10.0'),
        createAsset(nativeAssetId, '10.0'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(nativeAssetId, toAddress),
      );

      expect(result).toStrictEqual({ amount: '9.9989948' });
    });

    it('returns the maximum SOL when toAddress is omitted', async () => {
      mockBalances(
        createAsset(nativeAssetId, '10.0'),
        createAsset(nativeAssetId, '10.0'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(nativeAssetId),
      );

      expect(result).toStrictEqual({ amount: '9.9989948' });
    });

    it('returns 0 when the SOL balance only covers the fee and rent exemption', async () => {
      mockBalances(
        createAsset(nativeAssetId, '0.001'),
        createAsset(nativeAssetId, '0.001'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(nativeAssetId, toAddress),
      );

      expect(result).toStrictEqual({ amount: '0' });
    });

    it('returns the full SPL token balance when SOL covers the fee and rent', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '100' });
    });

    it('returns the full SPL token balance when toAddress is omitted', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet),
      );

      expect(result).toStrictEqual({ amount: '100' });
    });

    it('returns 0 when SOL cannot cover the SPL fee and rent', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '0.0001'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '0' });
    });

    it('returns 0 for SPL when SOL only covers the fee and ATA rent is needed', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '0.0011'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet),
      );

      expect(result).toStrictEqual({ amount: '0' });
    });

    it('returns 0 for SPL when the recipient has no ATA and SOL does not cover it', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '0.0011'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '0' });
    });

    it('returns the full SPL balance when the recipient ATA already exists', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '0.0011'),
      );
      mockRecipientAtaAccount(true);

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '100' });
    });

    it('reserves the legacy 165-byte ATA rent and queries the legacy ATA', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );

      const getMinimumBalanceForRentExemption = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(lamports(2000000n)),
      });
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getMinimumBalanceForRentExemption,
      } as never);

      await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(165n);

      const expectedAta =
        await SendSplTokenBuilder.deriveAssociatedTokenAccountAddress({
          mint: address(usdcMint),
          owner: address(toAddress),
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        });

      expect(mockConnection.fetchJsonParsedAccount).toHaveBeenCalledWith(
        expectedAta,
        Network.Mainnet,
        undefined,
        { skipCache: true },
      );
    });

    it('reserves the Token-2022 ATA rent for the mint extensions', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );

      vi.spyOn(mockConnection, 'fetchMint').mockResolvedValue({
        ...MOCK_MINT_ACCOUNT,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: {
          ...MOCK_MINT_ACCOUNT.data,
          extensions: {
            __option: 'Some',
            value: [{ __kind: 'TransferFeeConfig' }],
          },
        },
      } as never);

      const getMinimumBalanceForRentExemption = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(lamports(2000000n)),
      });
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getMinimumBalanceForRentExemption,
      } as never);

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      // 165 base + 1 account type + 4 immutable owner + 12 transfer fee amount.
      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(182n);

      const expectedAta =
        await SendSplTokenBuilder.deriveAssociatedTokenAccountAddress({
          mint: address(usdcMint),
          owner: address(toAddress),
          tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        });

      expect(mockConnection.fetchJsonParsedAccount).toHaveBeenCalledWith(
        expectedAta,
        Network.Mainnet,
        undefined,
        { skipCache: true },
      );
      expect(result).toStrictEqual({ amount: '100' });
    });

    it('reserves the Token-2022 ATA rent without mint extensions', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );

      vi.spyOn(mockConnection, 'fetchMint').mockResolvedValue({
        ...MOCK_MINT_ACCOUNT,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
      });

      const getMinimumBalanceForRentExemption = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(lamports(2000000n)),
      });
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getMinimumBalanceForRentExemption,
      } as never);

      await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      // 165 base + 1 account type + 4 immutable owner.
      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(170n);
    });

    it('does not reserve rent for confidential transfer extensions', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );

      vi.spyOn(mockConnection, 'fetchMint').mockResolvedValue({
        ...MOCK_MINT_ACCOUNT,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: {
          ...MOCK_MINT_ACCOUNT.data,
          extensions: {
            __option: 'Some',
            value: [
              { __kind: 'ConfidentialTransferMint' },
              { __kind: 'ConfidentialTransferFee' },
            ],
          },
        },
      } as never);

      const getMinimumBalanceForRentExemption = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(lamports(2000000n)),
      });
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getMinimumBalanceForRentExemption,
      } as never);

      await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      // Confidential transfer extensions are configured after ATA creation.
      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(170n);
    });

    it('pads the ATA rent at the multisig-length boundary', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );

      // Synthetic extensions that add up to the 355-byte multisig length, which
      // is padded by an extra extension type.
      vi.spyOn(mockConnection, 'fetchMint').mockResolvedValue({
        ...MOCK_MINT_ACCOUNT,
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: {
          ...MOCK_MINT_ACCOUNT.data,
          extensions: {
            __option: 'Some',
            value: [
              ...Array.from({ length: 15 }, () => ({
                __kind: 'TransferFeeConfig',
              })),
              { __kind: 'TransferHook' },
            ],
          },
        },
      } as never);

      const getMinimumBalanceForRentExemption = vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue(lamports(2000000n)),
      });
      vi.spyOn(mockConnection, 'getRpc').mockReturnValue({
        getMinimumBalanceForRentExemption,
      } as never);

      await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      // 165 base + 1 account type + 4 immutable owner + 15 * 12 transfer fee
      // amount + 5 transfer hook, then + 2 to avoid the multisig length.
      expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(357n);
    });

    it('treats an empty toAddress as absent', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '0.0011'),
      );

      const withoutToAddress = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet),
      );
      const withEmptyToAddress = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, ''),
      );

      expect(withEmptyToAddress).toStrictEqual(withoutToAddress);
      expect(withEmptyToAddress).toStrictEqual({ amount: '0' });
    });

    it('returns the full SPL balance when sending directly to a token account', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '0.0011'),
      );
      vi.spyOn(mockRecipientClassifier, 'classify').mockResolvedValue({
        type: 'TOKEN_ACCOUNT',
        mint: address(usdcMint),
      });

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '100' });
    });

    it('returns 0 for SPL when the recipient is unsupported', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '100.0'),
        createAsset(nativeAssetId, '1.0'),
      );
      vi.spyOn(mockRecipientClassifier, 'classify').mockResolvedValue({
        type: 'UNSUPPORTED',
      });

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '0' });
    });

    it('returns 0 when the asset is not held', async () => {
      mockBalances(null, createAsset(nativeAssetId, '10.0'));

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '0' });
    });

    it('returns 0 when the SPL balance is zero', async () => {
      mockBalances(
        createAsset(KnownCaip19Id.UsdcMainnet, '0'),
        createAsset(nativeAssetId, '1.0'),
      );

      const result = await sendService.getMaxSendableAmount(
        createRequest(KnownCaip19Id.UsdcMainnet, toAddress),
      );

      expect(result).toStrictEqual({ amount: '0' });
    });
  });
});
