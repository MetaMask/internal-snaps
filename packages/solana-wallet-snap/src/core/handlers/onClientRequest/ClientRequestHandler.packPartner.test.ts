import type { Logger } from '@metamask/snap-networks-utils';
import type { Json, JsonRpcRequest } from '@metamask/snaps-sdk';

import { Network } from '../../constants/solana';
import type { AccountsService, ApproveTokenService } from '../../services';
import type { SendService } from '../../services/send/SendService';
import type { WalletService } from '../../services/wallet/WalletService';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../test/mocks/solana-keyring-accounts';
import { ClientRequestHandler } from './ClientRequestHandler';

const account = MOCK_SOLANA_KEYRING_ACCOUNT_0;
const transaction = 'dHJhbnNhY3Rpb24=';
const signedResponse = {
  signedTransaction: 'c2lnbmVkLXRyYW5zYWN0aW9u',
  signature: 'signature',
};

const operations = [
  {
    method: 'signPackPartnerBuy',
    context: { amount: '25000000' },
  },
  {
    method: 'signPackPartnerBuyback',
    context: {
      amount: '20000000',
      assetAddress: account.address,
      expectedStandard: 'core',
    },
  },
] as const;

describe.each(operations)('$method client request', ({ method, context }) => {
  const findById = vi.fn();
  const signPackPartnerBuy = vi.fn();
  const signPackPartnerBuyback = vi.fn();
  const signAndSendTransaction = vi.fn();
  const confirmSend = vi.fn();
  const walletService = {
    signPackPartnerBuy,
    signPackPartnerBuyback,
    signAndSendTransaction,
  };
  const signingMethod = walletService[method];
  let handler: ClientRequestHandler;

  const makeRequest = (
    overrides: Record<string, Json> = {},
  ): JsonRpcRequest => ({
    id: 1,
    jsonrpc: '2.0',
    method,
    params: {
      accountId: account.id,
      scope: Network.Mainnet,
      transaction,
      context,
      ...overrides,
    },
  });

  beforeEach(() => {
    vi.resetAllMocks();
    findById.mockResolvedValue(account);
    signingMethod.mockResolvedValue(signedResponse);
    handler = new ClientRequestHandler(
      { findById } as unknown as AccountsService,
      walletService as unknown as WalletService,
      {
        log: vi.fn(),
        withPrefix: vi.fn().mockReturnThis(),
      } as unknown as Logger,
      { confirmSend } as unknown as SendService,
      {} as ApproveTokenService,
    );
  });

  it('uses the keyring account and returns the signed transaction without sending or confirming', async () => {
    const response = await handler.handle(makeRequest());

    expect(findById).toHaveBeenCalledWith(account.id);
    expect(signingMethod).toHaveBeenCalledWith(
      account,
      transaction,
      context,
      Network.Mainnet,
    );
    expect(response).toStrictEqual(signedResponse);
    expect(signAndSendTransaction).not.toHaveBeenCalled();
    expect(confirmSend).not.toHaveBeenCalled();
  });

  it('rejects an unknown account before signing', async () => {
    findById.mockResolvedValue(null);

    await expect(handler.handle(makeRequest())).rejects.toThrow(
      `Account not found: ${account.id}`,
    );
    expect(signingMethod).not.toHaveBeenCalled();
  });

  it.each([
    { requested: Network.Mainnet, supported: Network.Devnet },
    { requested: Network.Devnet, supported: Network.Mainnet },
  ])(
    'rejects account scope $supported when $requested was requested',
    async ({ requested, supported }) => {
      findById.mockResolvedValue({ ...account, scopes: [supported] });

      await expect(
        handler.handle(makeRequest({ scope: requested })),
      ).rejects.toThrow(
        'Account does not support the requested Solana network',
      );
      expect(signingMethod).not.toHaveBeenCalled();
      expect(signAndSendTransaction).not.toHaveBeenCalled();
    },
  );

  it('passes devnet scope to the guarded signer', async () => {
    findById.mockResolvedValue({ ...account, scopes: [Network.Devnet] });

    await handler.handle(makeRequest({ scope: Network.Devnet }));

    expect(signingMethod).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [Network.Devnet] }),
      transaction,
      context,
      Network.Devnet,
    );
    expect(signAndSendTransaction).not.toHaveBeenCalled();
  });

  it('propagates transaction validation failures without sending or confirming', async () => {
    signingMethod.mockRejectedValue(
      new Error('Pack Partner signature invalid'),
    );

    await expect(handler.handle(makeRequest())).rejects.toThrow(
      'Pack Partner signature invalid',
    );
    expect(signAndSendTransaction).not.toHaveBeenCalled();
    expect(confirmSend).not.toHaveBeenCalled();
  });

  it.each(['accountId', 'scope', 'transaction', 'context'])(
    'requires the %s parameter before account lookup',
    async (field) => {
      const params: Record<string, Json> = {
        accountId: account.id,
        scope: Network.Mainnet,
        transaction,
        context,
      };
      delete params[field];

      await expect(
        handler.handle({ ...makeRequest(), params }),
      ).rejects.toThrow('Invalid method parameter(s).');
      expect(findById).not.toHaveBeenCalled();
      expect(signingMethod).not.toHaveBeenCalled();
    },
  );

  it.each(Object.keys(context))(
    'requires context.%s before account lookup',
    async (field) => {
      const incompleteContext: Record<string, Json> = { ...context };
      delete incompleteContext[field];

      await expect(
        handler.handle(makeRequest({ context: incompleteContext })),
      ).rejects.toThrow('Invalid method parameter(s).');
      expect(findById).not.toHaveBeenCalled();
      expect(signingMethod).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['testnet', { scope: Network.Testnet }],
    ['localnet', { scope: Network.Localnet }],
    ['unknown network', { scope: 'solana:unknown' }],
    ['missing network', { scope: null }],
    ['invalid account ID', { accountId: 'not-an-account-id' }],
    ['invalid transaction encoding', { transaction: 'not base64!' }],
    ['missing context', { context: null }],
    ['caller-supplied address', { address: account.address }],
    ['caller-supplied options', { options: { skipPreflight: true } }],
    [
      'caller-supplied USDC mint',
      { context: { ...context, usdcMint: account.address } },
    ],
    [
      'caller-supplied fee cap',
      { context: { ...context, maxFee: '1000000000' } },
    ],
  ] satisfies [string, Record<string, Json>][])(
    'rejects %s before account lookup',
    async (_name, overrides) => {
      await expect(handler.handle(makeRequest(overrides))).rejects.toThrow(
        'Invalid method parameter(s).',
      );
      expect(findById).not.toHaveBeenCalled();
      expect(signingMethod).not.toHaveBeenCalled();
    },
  );

  it.each([
    '',
    '0',
    '-1',
    '+1',
    '01',
    '1.5',
    '1e6',
    ' 1',
    '1 ',
    '18446744073709551616',
    '9'.repeat(200),
    25,
  ])(
    'rejects non-canonical or out-of-range atomic amount %s',
    async (amount) => {
      await expect(
        handler.handle(makeRequest({ context: { ...context, amount } })),
      ).rejects.toThrow('Invalid method parameter(s).');
      expect(signingMethod).not.toHaveBeenCalled();
    },
  );

  it.each(['1', '18446744073709551615'])(
    'accepts the u64 boundary %s without number coercion',
    async (amount) => {
      await handler.handle(makeRequest({ context: { ...context, amount } }));

      expect(signingMethod).toHaveBeenCalledWith(
        account,
        transaction,
        {
          ...context,
          amount,
        },
        Network.Mainnet,
      );
    },
  );

  if (method === 'signPackPartnerBuyback') {
    it.each([null, '', 'not-a-mint'])(
      'rejects an invalid asset address %s',
      async (assetAddress) => {
        await expect(
          handler.handle(
            makeRequest({ context: { ...context, assetAddress } }),
          ),
        ).rejects.toThrow('Invalid method parameter(s).');
        expect(signingMethod).not.toHaveBeenCalled();
      },
    );

    it('requires the selected asset address and standard', async () => {
      await expect(
        handler.handle(makeRequest({ context: { amount: context.amount } })),
      ).rejects.toThrow('Invalid method parameter(s).');
      expect(signingMethod).not.toHaveBeenCalled();
    });

    it.each(['core', 'pnft', 'nft', 'cnft-core', 'unknown'])(
      'accepts a known standard label %s for validator routing',
      async (expectedStandard) => {
        await handler.handle(
          makeRequest({ context: { ...context, expectedStandard } }),
        );
        expect(signingMethod).toHaveBeenCalledWith(
          account,
          transaction,
          {
            ...context,
            expectedStandard,
          },
          Network.Mainnet,
        );
      },
    );

    it.each([null, '', 'not-a-standard'])(
      'rejects an invalid expected standard %s',
      async (expectedStandard) => {
        await expect(
          handler.handle(
            makeRequest({ context: { ...context, expectedStandard } }),
          ),
        ).rejects.toThrow('Invalid method parameter(s).');
        expect(signingMethod).not.toHaveBeenCalled();
      },
    );
  }
});

describe('unsupported Pack Partner methods', () => {
  it('rejects the removed Pack Partner balance method before account lookup', async () => {
    const findById = vi.fn().mockResolvedValue(account);
    const handler = new ClientRequestHandler(
      { findById } as unknown as AccountsService,
      {} as WalletService,
      {
        log: vi.fn(),
        withPrefix: vi.fn().mockReturnThis(),
      } as unknown as Logger,
      {} as SendService,
      {} as ApproveTokenService,
    );

    await expect(
      handler.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'getPackPartnerBalance',
        params: { accountId: account.id, scope: Network.Devnet },
      }),
    ).rejects.toMatchObject({ code: -32601 });
    expect(findById).not.toHaveBeenCalled();
  });
});
