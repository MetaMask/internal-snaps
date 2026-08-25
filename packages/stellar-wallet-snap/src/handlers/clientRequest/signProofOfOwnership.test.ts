import type { JsonRpcRequest } from '@metamask/utils';

import { AccountService, StellarKeyringAccount } from '../../services/account';
import { generateStellarKeyringAccount } from '../../services/account/__mocks__/account.fixtures';
import { mockOnChainAccountService } from '../../services/on-chain-account/__mocks__/onChainAccount.fixtures';
import { Wallet, WalletService } from '../../services/wallet';
import { getTestWallet } from '../../services/wallet/__mocks__/wallet.fixtures';
import { logger } from '../../utils/logger';
import { AccountResolver } from '../accountResolver';
import { ClientRequestMethod } from './api';
import { SignProofOfOwnershipHandler } from './signProofOfOwnership';

jest.mock('../../utils/logger');

describe('SignProofOfOwnershipHandler', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';
  const nonce = 'a1b2c3d4e5f6789012345678';

  type SetupResult = {
    handler: SignProofOfOwnershipHandler;
    account: StellarKeyringAccount;
    wallet: Wallet;
    resolveAccountSpy: jest.SpyInstance;
    resolveWalletSpy: jest.SpyInstance;
    buildProofMessage: (proofNonce?: string, proofAddress?: string) => string;
    createRequest: (message?: string) => JsonRpcRequest;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup(): SetupResult {
    const wallet = getTestWallet();
    const account = generateStellarKeyringAccount(
      accountId,
      wallet.address,
      'entropy-source-1',
      0,
    );

    const { accountService, onChainAccountService, walletService } =
      mockOnChainAccountService();
    const accountResolver = new AccountResolver({
      accountService,
      onChainAccountService,
      walletService,
    });

    const resolveAccountSpy = jest
      .spyOn(AccountService.prototype, 'resolveAccount')
      .mockResolvedValue({ account });

    const resolveWalletSpy = jest
      .spyOn(WalletService.prototype, 'resolveWallet')
      .mockResolvedValue(wallet);

    const handler = new SignProofOfOwnershipHandler({
      logger,
      accountResolver,
    });

    const buildProofMessage = (
      proofNonce: string = nonce,
      proofAddress: string = wallet.address,
    ): string => `metamask:proof-of-ownership:${proofNonce}:${proofAddress}`;

    const createRequest = (message?: string): JsonRpcRequest => ({
      jsonrpc: '2.0',
      id: 1,
      method: ClientRequestMethod.SignProofOfOwnership,
      params: {
        accountId,
        message: message ?? buildProofMessage(),
      },
    });

    return {
      handler,
      account,
      wallet,
      resolveAccountSpy,
      resolveWalletSpy,
      buildProofMessage,
      createRequest,
    };
  }

  it('signs the proof message and returns the SEP-0053 base64 signature', async () => {
    const {
      handler,
      wallet,
      resolveAccountSpy,
      resolveWalletSpy,
      buildProofMessage,
      createRequest,
    } = setup();
    const message = buildProofMessage();

    const result = await handler.handle(createRequest());

    expect(resolveAccountSpy).toHaveBeenCalledWith({ accountId });
    expect(resolveWalletSpy).toHaveBeenCalled();
    expect(result).toStrictEqual({
      signature: wallet.signMessage(message),
    });
    expect(wallet.verifyMessage(message, result.signature)).toBe(true);
  });

  it('throws if the address in the message does not match the signing account', async () => {
    const { handler, wallet, createRequest, buildProofMessage } = setup();
    const otherWallet = getTestWallet();
    const otherAddress = otherWallet.address;

    await expect(
      handler.handle(createRequest(buildProofMessage(nonce, otherAddress))),
    ).rejects.toThrow(
      `Address in proof-of-ownership message (${otherAddress}) does not match signing account address (${wallet.address})`,
    );
  });
});
