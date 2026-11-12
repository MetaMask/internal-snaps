import { InvalidParamsError } from '@metamask/snaps-sdk';
import type { JsonRpcRequest } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import type { MockInstance } from 'vitest';

import { KnownCaip2ChainId } from '../../api';
import { AccountService } from '../../services/account';
import { generateStellarKeyringAccount } from '../../services/account/__mocks__/account.fixtures';
import type { StellarAssetMetadata } from '../../services/asset-metadata';
import { AssetMetadataService } from '../../services/asset-metadata';
import {
  createMockAssetMetadataService,
  generateMockStellarAssetMetadata,
  NATIVE,
  USDC_CLASSIC,
  USDC_SEP41,
} from '../../services/asset-metadata/__mocks__/assets.fixtures';
import { getNativeAssetMetadata } from '../../services/asset-metadata/utils';
import {
  OnChainAccount,
  OnChainAccountService,
} from '../../services/on-chain-account';
import {
  createMockAccountWithBalances,
  DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
  horizonSource,
  mockOnChainAccountService,
} from '../../services/on-chain-account/__mocks__/onChainAccount.fixtures';
import type { Transaction } from '../../services/transaction';
import { TransactionService } from '../../services/transaction';
import { createMockTransactionService } from '../../services/transaction/__mocks__/transaction.fixtures';
import {
  InsufficientBalanceException,
  InsufficientBalanceToCoverFeeException,
  TrustlineExceedLimitException,
} from '../../services/transaction/exceptions';
import { WalletService } from '../../services/wallet';
import { getTestWallet } from '../../services/wallet/__mocks__/wallet.fixtures';
import { logger } from '../../utils/logger';
import { AccountResolver } from '../accountResolver';
import { ClientRequestMethod } from './api';
import type { GetMaxSendableAmountJsonRpcRequest } from './api';
import { GetMaxSendableAmountHandler } from './getMaxSendableAmount';

const destinationAddress =
  'GDTF7ERUQVTX23ZD6NY5XRYC5IQAKWFVTQ6IXSMEZWGVNDDGPYCVHRZP';

const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

describe('GetMaxSendableAmountHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const accountId = '11111111-1111-4111-8111-111111111111';
  const scope = KnownCaip2ChainId.Mainnet;

  type SetupResult = {
    handler: GetMaxSendableAmountHandler;
    onChainAccount: OnChainAccount;
    createValidatedSendTransaction: MockInstance;
    getOnChainAccountSnapshotSpy: MockInstance;
  };

  function setup({
    nativeBalance = 10,
    assets = [],
  }: {
    nativeBalance?: number;
    assets?: Parameters<typeof createMockAccountWithBalances>[2]['assets'];
  } = {}): SetupResult {
    const wallet = getTestWallet();
    const account = generateStellarKeyringAccount(
      accountId,
      wallet.address,
      'entropy-source-1',
      0,
    );
    const mockRawAccount = createMockAccountWithBalances(wallet.address, '1', {
      ...DEFAULT_MOCK_ACCOUNT_WITH_BALANCES,
      nativeBalance,
      assets,
    });
    const onChainAccount = new OnChainAccount(
      mockRawAccount,
      scope,
      horizonSource(mockRawAccount, scope),
    );

    const { accountService, onChainAccountService, walletService } =
      mockOnChainAccountService();
    vi.spyOn(AccountService.prototype, 'resolveAccount').mockResolvedValue({
      account,
    });
    const getOnChainAccountSnapshotSpy = vi
      .spyOn(OnChainAccountService.prototype, 'getOnChainAccountSnapshot')
      .mockResolvedValue(onChainAccount);
    vi.spyOn(WalletService.prototype, 'resolveWallet').mockResolvedValue(
      wallet,
    );

    const { transactionService } = createMockTransactionService();
    const createValidatedSendTransaction = vi
      .spyOn(TransactionService.prototype, 'createValidatedSendTransaction')
      .mockResolvedValue({} as Transaction);

    const { service: assetMetadataService } = createMockAssetMetadataService();
    vi.spyOn(AssetMetadataService.prototype, 'resolve').mockImplementation(
      async (assetId) =>
        assetId === NATIVE
          ? getNativeAssetMetadata(scope)
          : (generateMockStellarAssetMetadata()[
              assetId
            ] as StellarAssetMetadata),
    );

    const accountResolver = new AccountResolver({
      accountService,
      onChainAccountService,
      walletService,
    });

    const handler = new GetMaxSendableAmountHandler({
      logger,
      accountResolver,
      assetMetadataService,
      transactionService,
    });

    return {
      handler,
      onChainAccount,
      createValidatedSendTransaction,
      getOnChainAccountSnapshotSpy,
    };
  }

  function baseRequest(
    overrides: Partial<
      Pick<
        GetMaxSendableAmountJsonRpcRequest['params'],
        'accountId' | 'assetId' | 'toAddress'
      >
    > = {},
  ): JsonRpcRequest {
    return {
      jsonrpc: '2.0' as const,
      id: 1,
      method: ClientRequestMethod.GetMaxSendableAmount,
      params: {
        accountId,
        assetId: NATIVE,
        ...overrides,
      },
    };
  }

  it('returns the maximum XLM leaving the fee', async () => {
    const { handler, onChainAccount, createValidatedSendTransaction } = setup();
    // 10 XLM total - 1 XLM minimum reserve = 9 XLM spendable, minus 100 stroops fee.
    createValidatedSendTransaction.mockRejectedValueOnce(
      new InsufficientBalanceException('89999900', '90000000', NATIVE),
    );

    expect(await handler.handle(baseRequest())).toStrictEqual({
      amount: '8.99999',
    });
    expect(createValidatedSendTransaction).toHaveBeenCalledWith({
      onChainAccount,
      scope,
      assetId: NATIVE,
      amount: new BigNumber('90000000'),
      destination: onChainAccount.accountId,
      skipExceptions: [TrustlineExceedLimitException],
      useCache: true,
    });
  });

  it('accepts an optional toAddress for XLM', async () => {
    const { handler, createValidatedSendTransaction } = setup();
    createValidatedSendTransaction.mockRejectedValueOnce(
      new InsufficientBalanceException('89999900', '90000000', NATIVE),
    );

    expect(
      await handler.handle(baseRequest({ toAddress: destinationAddress })),
    ).toStrictEqual({ amount: '8.99999' });
  });

  it('returns 0 when XLM only covers the reserve', async () => {
    const { handler, createValidatedSendTransaction } = setup({
      nativeBalance: 1,
    });

    expect(await handler.handle(baseRequest())).toStrictEqual({
      amount: '0',
    });
    expect(createValidatedSendTransaction).not.toHaveBeenCalled();
  });

  it('returns 0 when XLM cannot cover the fee', async () => {
    const { handler, createValidatedSendTransaction } = setup();
    createValidatedSendTransaction.mockRejectedValueOnce(
      new InsufficientBalanceToCoverFeeException('0', '100'),
    );

    expect(await handler.handle(baseRequest())).toStrictEqual({
      amount: '0',
    });
  });

  it('returns the full USDC trustline balance', async () => {
    const { handler, onChainAccount, createValidatedSendTransaction } = setup({
      nativeBalance: 2,
      assets: [
        {
          assetType: 'credit_alphanum4',
          assetCode: 'USDC',
          assetIssuer: USDC_ISSUER,
          balance: 5,
        },
      ],
    });

    expect(
      await handler.handle(baseRequest({ assetId: USDC_CLASSIC })),
    ).toStrictEqual({ amount: '5' });
    expect(createValidatedSendTransaction).toHaveBeenCalledWith({
      onChainAccount,
      scope,
      assetId: USDC_CLASSIC,
      amount: new BigNumber('50000000'),
      destination: onChainAccount.accountId,
      skipExceptions: [TrustlineExceedLimitException],
      useCache: true,
    });
  });

  it('accepts an optional toAddress for USDC', async () => {
    const { handler } = setup({
      assets: [
        {
          assetType: 'credit_alphanum4',
          assetCode: 'USDC',
          assetIssuer: USDC_ISSUER,
          balance: 5.0000001,
        },
      ],
    });

    expect(
      await handler.handle(
        baseRequest({
          assetId: USDC_CLASSIC,
          toAddress: destinationAddress,
        }),
      ),
    ).toStrictEqual({ amount: '5.0000001' });
  });

  it('returns 0 when XLM cannot cover the fee for a USDC send', async () => {
    const { handler, createValidatedSendTransaction } = setup({
      nativeBalance: 1,
      assets: [
        {
          assetType: 'credit_alphanum4',
          assetCode: 'USDC',
          assetIssuer: USDC_ISSUER,
          balance: 5,
        },
      ],
    });
    createValidatedSendTransaction.mockRejectedValueOnce(
      new InsufficientBalanceToCoverFeeException('0', '100'),
    );

    expect(
      await handler.handle(baseRequest({ assetId: USDC_CLASSIC })),
    ).toStrictEqual({ amount: '0' });
  });

  it('returns 0 when the asset balance cannot cover the transfer', async () => {
    const { handler, createValidatedSendTransaction } = setup({
      assets: [
        {
          assetType: 'credit_alphanum4',
          assetCode: 'USDC',
          assetIssuer: USDC_ISSUER,
          balance: 5,
        },
      ],
    });
    createValidatedSendTransaction.mockRejectedValueOnce(
      new InsufficientBalanceException('50000000', '50000000', USDC_CLASSIC),
    );

    expect(
      await handler.handle(baseRequest({ assetId: USDC_CLASSIC })),
    ).toStrictEqual({ amount: '0' });
  });

  it('returns 0 when the trustline balance is zero', async () => {
    const { handler, createValidatedSendTransaction } = setup({
      assets: [
        {
          assetType: 'credit_alphanum4',
          assetCode: 'USDC',
          assetIssuer: USDC_ISSUER,
          balance: 0,
        },
      ],
    });

    expect(
      await handler.handle(baseRequest({ assetId: USDC_CLASSIC })),
    ).toStrictEqual({ amount: '0' });
    expect(createValidatedSendTransaction).not.toHaveBeenCalled();
  });

  it('returns 0 when the USDC trustline is not authorized', async () => {
    const { handler, createValidatedSendTransaction } = setup({
      assets: [
        {
          assetType: 'credit_alphanum4',
          assetCode: 'USDC',
          assetIssuer: USDC_ISSUER,
          balance: 5,
          isAuthorized: false,
        },
      ],
    });

    expect(
      await handler.handle(baseRequest({ assetId: USDC_CLASSIC })),
    ).toStrictEqual({ amount: '0' });
    expect(createValidatedSendTransaction).not.toHaveBeenCalled();
  });

  it('returns 0 when the asset is not held', async () => {
    const { handler, createValidatedSendTransaction } = setup();

    expect(
      await handler.handle(baseRequest({ assetId: USDC_CLASSIC })),
    ).toStrictEqual({ amount: '0' });
    expect(createValidatedSendTransaction).not.toHaveBeenCalled();
  });

  it('returns the SEP-41 balance when the preflight succeeds', async () => {
    const { handler, onChainAccount, createValidatedSendTransaction } = setup({
      nativeBalance: 10,
    });
    onChainAccount.setAsset(USDC_SEP41, {
      balance: new BigNumber('50000000'),
      symbol: 'USDC',
      decimals: 7,
    });

    expect(
      await handler.handle(baseRequest({ assetId: USDC_SEP41 })),
    ).toStrictEqual({ amount: '5' });
    expect(createValidatedSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: USDC_SEP41,
        amount: new BigNumber('50000000'),
        useCache: true,
      }),
    );
  });

  it('rethrows unexpected SEP-41 preflight failures', async () => {
    const { handler, onChainAccount, createValidatedSendTransaction } = setup({
      nativeBalance: 10,
    });
    onChainAccount.setAsset(USDC_SEP41, {
      balance: new BigNumber('50000000'),
      symbol: 'USDC',
      decimals: 7,
    });
    createValidatedSendTransaction.mockRejectedValueOnce(new Error('boom'));

    await expect(
      handler.handle(baseRequest({ assetId: USDC_SEP41 })),
    ).rejects.toThrow('boom');
  });

  it('returns 0 when the keyring state has no on-chain snapshot', async () => {
    const { handler, getOnChainAccountSnapshotSpy } = setup();
    getOnChainAccountSnapshotSpy.mockResolvedValueOnce(null);

    expect(await handler.handle(baseRequest())).toStrictEqual({
      amount: '0',
    });
  });

  it('throws InvalidParamsError when the request fails struct validation', async () => {
    const { handler } = setup();

    await expect(
      handler.handle({
        ...baseRequest(),
        params: { accountId, assetId: 'not-an-asset' },
      }),
    ).rejects.toThrow(InvalidParamsError);
  });
});
