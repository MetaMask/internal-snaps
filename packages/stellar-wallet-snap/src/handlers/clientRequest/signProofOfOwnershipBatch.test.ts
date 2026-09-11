import type { JsonRpcRequest } from '@metamask/utils';

import { AccountService } from '../../services/account';
import type { StellarKeyringAccount } from '../../services/account';
import { generateStellarKeyringAccount } from '../../services/account/__mocks__/account.fixtures';
import { mockOnChainAccountService } from '../../services/on-chain-account/__mocks__/onChainAccount.fixtures';
import { WalletService } from '../../services/wallet';
import { getTestWallet } from '../../services/wallet/__mocks__/wallet.fixtures';
import { logger } from '../../utils/logger';
import { ClientRequestMethod } from './api';
import { SignProofOfOwnershipBatchHandler } from './signProofOfOwnershipBatch';

jest.mock('../../utils/logger');

describe('SignProofOfOwnershipBatchHandler', () => {
  const accountId1 = '11111111-1111-4111-8111-111111111111';
  const accountId2 = '22222222-2222-4222-8222-222222222222';
  const missingAccountId = '33333333-3333-4333-8333-333333333333';
  const nonce = 'a1b2c3d4e5f6789012345678';

  type SetupResult = {
    handler: SignProofOfOwnershipBatchHandler;
    account1: StellarKeyringAccount;
    account2: StellarKeyringAccount;
    wallet1: ReturnType<typeof getTestWallet>;
    wallet2: ReturnType<typeof getTestWallet>;
    findByIdsSpy: jest.SpyInstance;
    getWalletResolverSpy: jest.SpyInstance;
    walletResolver: jest.Mock;
    buildProofMessage: (proofAddress: string, proofNonce?: string) => string;
    createRequest: (
      items: { accountId: string; message: string }[],
    ) => JsonRpcRequest;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup(): SetupResult {
    const wallet1 = getTestWallet();
    const wallet2 = getTestWallet();
    const account1 = generateStellarKeyringAccount(
      accountId1,
      wallet1.address,
      'entropy-source-1',
      0,
    );
    const account2 = generateStellarKeyringAccount(
      accountId2,
      wallet2.address,
      'entropy-source-1',
      1,
    );

    const { accountService, walletService } = mockOnChainAccountService();
    const findByIdsSpy = jest
      .spyOn(AccountService.prototype, 'findByIds')
      .mockResolvedValue([account2, account1]);
    const walletResolver = jest
      .fn()
      .mockResolvedValueOnce(wallet1)
      .mockResolvedValueOnce(wallet2);
    const getWalletResolverSpy = jest
      .spyOn(WalletService.prototype, 'getWalletResolver')
      .mockResolvedValue(walletResolver);

    const handler = new SignProofOfOwnershipBatchHandler({
      logger,
      accountService,
      walletService,
    });

    const buildProofMessage = (
      proofAddress: string,
      proofNonce: string = nonce,
    ): string => `metamask:proof-of-ownership:${proofNonce}:${proofAddress}`;

    const createRequest = (
      items: { accountId: string; message: string }[],
    ): JsonRpcRequest => ({
      jsonrpc: '2.0',
      id: 1,
      method: ClientRequestMethod.SignProofOfOwnershipBatch,
      params: { items },
    });

    return {
      handler,
      account1,
      account2,
      wallet1,
      wallet2,
      findByIdsSpy,
      getWalletResolverSpy,
      walletResolver,
      buildProofMessage,
      createRequest,
    };
  }

  it('signs proof messages and returns results in input order', async () => {
    const {
      handler,
      account1,
      account2,
      wallet1,
      wallet2,
      findByIdsSpy,
      getWalletResolverSpy,
      walletResolver,
      buildProofMessage,
      createRequest,
    } = setup();
    const message1 = buildProofMessage(wallet1.address);
    const message2 = buildProofMessage(wallet2.address);

    const result = await handler.handle(
      createRequest([
        { accountId: account1.id, message: message1 },
        { accountId: account2.id, message: message2 },
      ]),
    );

    expect(findByIdsSpy).toHaveBeenCalledWith([account1.id, account2.id]);
    expect(getWalletResolverSpy).toHaveBeenCalledTimes(1);
    expect(getWalletResolverSpy).toHaveBeenCalledWith('entropy-source-1');
    expect(walletResolver).toHaveBeenCalledWith(0);
    expect(walletResolver).toHaveBeenCalledWith(1);
    expect(result).toStrictEqual({
      results: [
        {
          accountId: account1.id,
          signature: `0x${wallet1.signMessage(message1, 'hex')}`,
        },
        {
          accountId: account2.id,
          signature: `0x${wallet2.signMessage(message2, 'hex')}`,
        },
      ],
    });
  });

  it('returns item-level errors for missing accounts and address mismatches', async () => {
    const {
      handler,
      account1,
      wallet1,
      wallet2,
      buildProofMessage,
      createRequest,
      walletResolver,
    } = setup();
    const validMessage = buildProofMessage(wallet1.address);
    const mismatchedMessage = buildProofMessage(wallet2.address);

    const result = await handler.handle(
      createRequest([
        { accountId: account1.id, message: validMessage },
        { accountId: missingAccountId, message: validMessage },
        { accountId: account1.id, message: mismatchedMessage },
      ]),
    );

    expect(walletResolver).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({
      results: [
        {
          accountId: account1.id,
          signature: `0x${wallet1.signMessage(validMessage, 'hex')}`,
        },
        {
          accountId: missingAccountId,
          error: `Account not found: ${missingAccountId}`,
        },
        {
          accountId: account1.id,
          error: `Address in proof-of-ownership message (${wallet2.address}) does not match signing account address (${wallet1.address})`,
        },
      ],
    });
  });

  it('returns item-level errors for invalid messages and wallet resolver failures', async () => {
    const {
      handler,
      account1,
      wallet1,
      getWalletResolverSpy,
      buildProofMessage,
      createRequest,
    } = setup();
    const validMessage = buildProofMessage(wallet1.address);
    getWalletResolverSpy.mockRejectedValueOnce(new Error('resolver failed'));

    const result = await handler.handle(
      createRequest([
        { accountId: account1.id, message: 'not-a-proof-message' },
        { accountId: account1.id, message: validMessage },
      ]),
    );

    expect(result).toStrictEqual({
      results: [
        {
          accountId: account1.id,
          error: 'Message must start with "metamask:proof-of-ownership:"',
        },
        {
          accountId: account1.id,
          error: 'resolver failed',
        },
      ],
    });
  });
});
