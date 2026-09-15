import { Address, Keypair, Networks, hash, xdr } from '@stellar/stellar-sdk';

import { KnownCaip2ChainId } from '../../api';
import { buildAuthEntryPreimageXdr } from '../../api/__mocks__/xdr.fixtures';
import { AccountService } from '../../services/account';
import { generateStellarKeyringAccount } from '../../services/account/__mocks__/account.fixtures';
import { mockOnChainAccountService } from '../../services/on-chain-account/__mocks__/onChainAccount.fixtures';
import { WalletService } from '../../services/wallet';
import { getTestWallet } from '../../services/wallet/__mocks__/wallet.fixtures';
import type { ConfirmationUXController } from '../../ui/confirmation/controller';
import { bufferToUint8Array } from '../../utils/buffer';
import { logger } from '../../utils/logger';
import { AccountResolver } from '../accountResolver';
import { MultichainMethod } from './api';
import type { SignAuthEntryRequest } from './api';
import { Sep43ErrorCode } from './exceptions';
import { SignAuthEntryHandler } from './signAuthEntry';

jest.mock('../../utils/logger');

describe('SignAuthEntryHandler', () => {
  /**
   * Builds a {@link SignAuthEntryHandler} with mocked account / wallet
   * resolution and a stubbed `ConfirmationUXController`.
   *
   * @returns Handler instance and the test doubles needed by each spec.
   */
  function setupHandler() {
    const wallet = getTestWallet();
    const accountId = globalThis.crypto.randomUUID();
    const mockAccount = generateStellarKeyringAccount(
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

    jest
      .spyOn(AccountService.prototype, 'resolveAccount')
      .mockResolvedValue({ account: mockAccount });

    jest
      .spyOn(WalletService.prototype, 'resolveWallet')
      .mockResolvedValue(wallet);

    const renderConfirmationDialog = jest.fn();
    const confirmationUIController = {
      renderConfirmationDialog,
    } as Pick<
      ConfirmationUXController,
      'renderConfirmationDialog'
    > as unknown as ConfirmationUXController;

    const handler = new SignAuthEntryHandler({
      logger,
      accountResolver,
      confirmationUIController,
    });

    return {
      handler,
      mockAccount,
      wallet,
      renderConfirmationDialog,
    };
  }

  const validAuthEntry = buildAuthEntryPreimageXdr();

  const buildRequest = (
    accountId: string,
    overrides: Partial<SignAuthEntryRequest['request']['params']> = {},
  ): SignAuthEntryRequest => ({
    id: '11111111-1111-4111-8111-111111111111',
    origin: 'https://example.com',
    scope: KnownCaip2ChainId.Mainnet,
    account: accountId,
    request: {
      method: MultichainMethod.SignAuthEntry,
      params: {
        authEntry: validAuthEntry,
        ...overrides,
      },
    },
  });

  it.each([
    ['v1', (_address: string) => validAuthEntry],
    [
      'v2',
      (address: string) => buildAuthEntryPreimageXdr({ boundAddress: address }),
    ],
  ] as const)(
    'returns signedAuthEntry on confirm for a %s preimage',
    async (version, buildEntry) => {
      const { handler, mockAccount, wallet, renderConfirmationDialog } =
        setupHandler();
      renderConfirmationDialog.mockResolvedValue(true);

      const authEntry = buildEntry(wallet.address);
      const result = await handler.handle(
        buildRequest(mockAccount.id, { authEntry }),
      );

      expect(result).toStrictEqual({
        signedAuthEntry: wallet.signAuthEntry(authEntry),
        signerAddress: wallet.address,
      });

      const authorizationParams = renderConfirmationDialog.mock.calls[0]?.[0]
        .renderContext.readableAuthEntry.authorizations[0]?.params as
        | { key: string; value: string; type: string }[]
        | undefined;

      if (version === 'v2') {
        expect(authorizationParams).toStrictEqual(
          expect.arrayContaining([
            {
              key: 'authorizedAddress',
              value: wallet.address,
              type: 'copyable',
            },
          ]),
        );
      } else {
        expect(authorizationParams?.map((param) => param.key)).not.toContain(
          'authorizedAddress',
        );
      }
    },
  );

  it('returns error -3 when a v2 bound address does not match the signing account', async () => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();

    const result = await handler.handle(
      buildRequest(mockAccount.id, {
        authEntry: buildAuthEntryPreimageXdr({
          boundAddress: Keypair.random().publicKey(),
        }),
      }),
    );

    expect(result).toMatchObject({
      error: {
        code: Sep43ErrorCode.InvalidRequest,
        message: expect.stringContaining('bound address'),
      },
    });
    expect(renderConfirmationDialog).not.toHaveBeenCalled();
  });

  it('passes a decoded readable preimage to the confirmation dialog', async () => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();
    renderConfirmationDialog.mockResolvedValue(true);

    await handler.handle(buildRequest(mockAccount.id));

    expect(renderConfirmationDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        renderContext: expect.objectContaining({
          readableAuthEntry: expect.objectContaining({
            signatureExpirationLedger: 1_000_000,
            nonce: '123456789',
            authorizations: [
              {
                params: [
                  {
                    key: 'contractId',
                    value: expect.stringMatching(/^C[A-Z2-7]+$/u),
                    type: 'copyable',
                  },
                  {
                    key: 'functionName',
                    value: 'transfer',
                    type: 'text',
                  },
                ],
              },
            ],
          }),
        }),
      }),
    );
  });

  it('decodes function arguments and nested sub-invocations into the readable preimage', async () => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();
    renderConfirmationDialog.mockResolvedValue(true);

    // transfer(to: G…, amount: 10) wrapped around a single nested call to
    // verify both args decoding (address strkey + i128) and recursive
    // sub-invocation decoding.
    const recipient = Keypair.random().publicKey();
    const args = [
      xdr.ScVal.scvAddress(Address.fromString(recipient).toScAddress()),
      xdr.ScVal.scvI128(
        new xdr.Int128Parts({
          hi: 0n,
          lo: 10n,
        }),
      ),
    ];
    const nestedInvocation = new xdr.SorobanAuthorizedInvocation({
      function:
        xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.InvokeContractArgs({
            contractAddress: Address.contract(
              bufferToUint8Array(new Uint8Array(32).fill(2)),
            ).toScAddress(),
            functionName: 'approve',
            args: [],
          }),
        ),
      subInvocations: [],
    });
    const authEntry = buildAuthEntryPreimageXdr({
      args,
      subInvocations: [nestedInvocation],
    });

    await handler.handle(buildRequest(mockAccount.id, { authEntry }));

    expect(renderConfirmationDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        renderContext: expect.objectContaining({
          readableAuthEntry: expect.objectContaining({
            authorizations: [
              {
                params: [
                  {
                    key: 'contractId',
                    value: expect.stringMatching(/^C[A-Z2-7]+$/u),
                    type: 'copyable',
                  },
                  {
                    key: 'functionName',
                    value: 'transfer',
                    type: 'text',
                  },
                  {
                    key: 'arguments',
                    value: [recipient, '10'],
                    type: 'json',
                  },
                ],
              },
              {
                params: [
                  {
                    key: 'contractId',
                    value: expect.stringMatching(/^C[A-Z2-7]+$/u),
                    type: 'copyable',
                  },
                  {
                    key: 'functionName',
                    value: 'approve',
                    type: 'text',
                  },
                ],
              },
            ],
          }),
        }),
      }),
    );
  });

  it('returns error -4 when user rejects', async () => {
    const { handler, mockAccount, wallet, renderConfirmationDialog } =
      setupHandler();
    renderConfirmationDialog.mockResolvedValue(false);

    const result = await handler.handle(buildRequest(mockAccount.id));

    expect(result).toMatchObject({
      signedAuthEntry: '',
      signerAddress: wallet.address,
      error: { code: Sep43ErrorCode.UserRejected },
    });
  });

  it('returns error -3 when scope is testnet', async () => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();

    const result = await handler.handle({
      ...buildRequest(mockAccount.id),
      scope: KnownCaip2ChainId.Testnet,
    });

    expect(result).toMatchObject({
      signedAuthEntry: '',
      signerAddress: '',
      error: { code: Sep43ErrorCode.InvalidRequest },
    });
    expect(renderConfirmationDialog).not.toHaveBeenCalled();
  });

  it('returns error -3 when opts.networkPassphrase is not the mainnet passphrase', async () => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();

    const result = await handler.handle(
      buildRequest(mockAccount.id, {
        opts: { networkPassphrase: Networks.TESTNET },
      }),
    );

    expect(result).toMatchObject({
      error: {
        code: Sep43ErrorCode.InvalidRequest,
        ext: [expect.stringContaining('mainnet')],
      },
    });
    expect(renderConfirmationDialog).not.toHaveBeenCalled();
  });

  it.each([
    ['opts.submit', { submit: true }],
    ['opts.submitUrl', { submitUrl: 'https://horizon.stellar.org' }],
  ])('returns error -3 when %s is provided', async (_label, forbiddenOpts) => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();

    const base = buildRequest(mockAccount.id);
    // Inject the forbidden opt bypassing the struct type so we can assert the
    // handler rejects it at runtime with -3 InvalidRequest.
    (base.request.params as unknown as { opts: Record<string, unknown> }).opts =
      forbiddenOpts;

    const result = await handler.handle(base);

    expect(result).toMatchObject({
      error: { code: Sep43ErrorCode.InvalidRequest },
    });
    expect(renderConfirmationDialog).not.toHaveBeenCalled();
  });

  it('returns error -3 when authEntry is not valid base64 XDR', async () => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();

    const result = await handler.handle(
      buildRequest(mockAccount.id, { authEntry: 'not-base64-xdr' }),
    );

    expect(result).toMatchObject({
      error: { code: Sep43ErrorCode.InvalidRequest },
    });
    expect(renderConfirmationDialog).not.toHaveBeenCalled();
  });

  it.each([
    {
      // v1 preimage
      boundAddress: undefined,
      networkPassphrase: Networks.TESTNET,
    },
    {
      // CAP-71 v2 preimage
      boundAddress: Keypair.random().publicKey(),
      networkPassphrase: Networks.TESTNET,
    },
  ])(
    "returns error -3 when authEntry's embedded networkId is not mainnet",
    async ({ boundAddress, networkPassphrase }) => {
      const { handler, mockAccount, renderConfirmationDialog } = setupHandler();

      // Same shape as the mainnet fixture, but with the embedded `networkId`
      // bound to testnet. The keyring `scope`/`opts.networkPassphrase` look
      // mainnet-y, so without the networkId check the snap would happily sign
      // a Soroban auth signature valid only against testnet.
      const testnetAuthEntry = buildAuthEntryPreimageXdr({
        networkPassphrase,
        boundAddress,
      });

      const result = await handler.handle(
        buildRequest(mockAccount.id, { authEntry: testnetAuthEntry }),
      );

      expect(result).toMatchObject({
        error: {
          code: Sep43ErrorCode.InvalidRequest,
          ext: [expect.stringContaining('networkId')],
        },
      });
      expect(renderConfirmationDialog).not.toHaveBeenCalled();
    },
  );

  it('returns error -3 when authEntry is a non-Soroban HashIdPreimage', async () => {
    const { handler, mockAccount, renderConfirmationDialog } = setupHandler();

    // A HashIdPreimage of a different envelope type (envelopeTypeContractId)
    // must be rejected — only Soroban authorization preimages are signable
    // here. We pick this variant because its inner shape only needs a
    // network ID + a contract ID preimage, no account/sequence types.
    const wrongPreimage = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({
        networkId: hash(bufferToUint8Array(Networks.PUBLIC, 'utf8')),
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAsset(
          xdr.Asset.assetTypeNative(),
        ),
      }),
    ).toXdr('base64');

    const result = await handler.handle(
      buildRequest(mockAccount.id, { authEntry: wrongPreimage }),
    );

    expect(result).toMatchObject({
      error: { code: Sep43ErrorCode.InvalidRequest },
    });
    expect(renderConfirmationDialog).not.toHaveBeenCalled();
  });

  it('ignores opts.address: signer is always determined by the keyring account UUID', async () => {
    const { handler, mockAccount, wallet, renderConfirmationDialog } =
      setupHandler();
    renderConfirmationDialog.mockResolvedValue(true);

    // Different valid Stellar G-address — MetaMask already routed to
    // `mockAccount` via the UUID, so this MUST be ignored.
    const otherAddress = Keypair.random().publicKey();

    const result = await handler.handle(
      buildRequest(mockAccount.id, { opts: { address: otherAddress } }),
    );

    const expected = wallet.signAuthEntry(validAuthEntry);
    expect(result).toStrictEqual({
      signedAuthEntry: expected,
      signerAddress: wallet.address,
    });
  });
});
