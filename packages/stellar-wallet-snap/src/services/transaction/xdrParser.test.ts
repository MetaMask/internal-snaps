import type { Operation } from '@stellar/stellar-sdk';
import { Asset, Networks, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import {
  getSlip44AssetId,
  toCaip19ClassicAssetId,
  toCaip19Sep41AssetId,
} from '../../utils';
import { caip2ChainIdToNetwork } from '../network/utils';
import {
  swapTransactionPathReceiveResponse,
  swapTransactionWithFeeCollectResponse,
  swapTransactionWithoutFeeCollectResponse,
  contractSwapReceiveNativeTransactionResponse,
} from './__mocks__/horizon-transaction-responses.fixtures';
import { buildMockInvokeHostFunctionTransaction } from './__mocks__/transaction.fixtures';
import type { MockInvokeHostFunctionArgNativeToScValOptions } from './__mocks__/transaction.fixtures';
import { XdrParseException } from './exceptions';
import {
  isSep41TransferInvoke,
  nativeToReadableJson,
  parseContractEventsFromResultMeta,
  parseSep41TransferInvoke,
  parseSuccessfulTransactionResult,
  parseScValToReadableJson,
  TransactionResultType,
  parseTransferContractEventSafe,
  xdrAssetToCaip19,
} from './xdrParser';

describe('transaction-xdr-decoder', () => {
  const scope = KnownCaip2ChainId.Mainnet;
  const accountAddress =
    'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO';
  const usdcIssuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

  describe('parseSuccessfulTransactionResult', () => {
    it('throws XdrParseException for invalid xdr', () => {
      expect(() =>
        parseSuccessfulTransactionResult('not-valid-xdr', scope),
      ).toThrow(XdrParseException);
    });

    it('parses pathPaymentStrictSendSuccess from single-op swap', () => {
      const result = parseSuccessfulTransactionResult(
        swapTransactionWithoutFeeCollectResponse.result_xdr,
        scope,
      );

      expect(result).toStrictEqual({
        feeCharged: '100',
        operationResults: [
          {
            type: TransactionResultType.PathPaymentStrictSendSuccess,
            amount: '0.1579988',
            destination: accountAddress,
            asset: toCaip19ClassicAssetId(scope, 'USDC', usdcIssuer),
          },
        ],
      });
    });

    it('parses pathPaymentStrictReceiveSuccess from single-op swap', () => {
      const result = parseSuccessfulTransactionResult(
        swapTransactionPathReceiveResponse.result_xdr,
        scope,
      );

      expect(result).toStrictEqual({
        feeCharged: '100',
        operationResults: [
          {
            type: TransactionResultType.PathPaymentStrictReceiveSuccess,
            amount: '0.19816',
            destination: accountAddress,
            asset: getSlip44AssetId(scope),
          },
        ],
      });
    });

    it('aligns operation results with operation index for multi-op swap', () => {
      const result = parseSuccessfulTransactionResult(
        swapTransactionWithFeeCollectResponse.result_xdr,
        scope,
      );

      expect(result).toStrictEqual({
        feeCharged: '200',
        operationResults: [
          {
            type: TransactionResultType.PathPaymentStrictSendSuccess,
            amount: '0.5257447',
            destination: accountAddress,
            asset: getSlip44AssetId(scope),
          },
          null,
        ],
      });
    });
  });

  describe('xdrAssetToCaip19', () => {
    it('maps native asset', () => {
      const asset = Asset.native().toXdrObject();

      expect(xdrAssetToCaip19(asset, scope)).toBe(getSlip44AssetId(scope));
    });

    it('maps alphanum4 credit asset', () => {
      const asset = new Asset('USDC', usdcIssuer).toXdrObject();

      expect(xdrAssetToCaip19(asset, scope)).toBe(
        toCaip19ClassicAssetId(scope, 'USDC', usdcIssuer),
      );
    });

    it('maps alphanum12 credit asset', () => {
      const asset = new Asset('LONGASSETCD', usdcIssuer).toXdrObject();

      expect(xdrAssetToCaip19(asset, scope)).toBe(
        toCaip19ClassicAssetId(scope, 'LONGASSETCD', usdcIssuer),
      );
    });

    it('returns undefined for pool share asset', () => {
      const asset = Asset.native().toXdrObject();
      (asset as { type: string }).type = 'assetTypePoolShare';

      expect(xdrAssetToCaip19(asset, scope)).toBeUndefined();
    });

    it('returns undefined for unsupported asset type', () => {
      const asset = Asset.native().toXdrObject();
      (asset as { type: string }).type = 'unsupportedAssetType';

      expect(xdrAssetToCaip19(asset, scope)).toBeUndefined();
    });

    it('returns undefined for credit asset when Asset.fromOperation fails', () => {
      const asset = new Asset('USDC', usdcIssuer).toXdrObject();
      jest.spyOn(Asset, 'fromOperation').mockImplementation(() => {
        throw new Error('Invalid asset type: assetTypePoolShare');
      });

      expect(xdrAssetToCaip19(asset, scope)).toBeUndefined();
    });
  });

  /**
   * Narrows an invoke-host-function op to its contract-call args.
   * SDK 17 types `func` as a `HostFunction` union, so `invokeContract` is
   * only available after checking `type`.
   *
   * @param op - Parsed invoke host function operation.
   * @returns Invoke-contract arguments from the host function.
   */
  function getInvokeContractArgs(
    op: Operation.InvokeHostFunction,
  ): xdr.InvokeContractArgs {
    const { func } = op;
    if (func.type !== 'hostFunctionTypeInvokeContract') {
      throw new Error(`expected invoke contract, got ${func.type}`);
    }
    return func.invokeContract;
  }

  describe('parseSep41TransferInvoke', () => {
    const fromAccountId =
      'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO';
    const toAccountId =
      'GDTF7ERUQVTX23ZD6NY5XRYC5IQAKWFVTQ6IXSMEZWGVNDDGPYCVHRZP';
    const contractId =
      'CBIJBDNZNF4X35BJ4FFZWCDBSCKOP5NB4PLG4SNENRMLAPYG4P5FM6VN';
    const transferArgOptions = [
      { type: 'address' as const },
      { type: 'address' as const },
      { type: 'i128' as const },
    ];

    function buildTransferInvokeOperation(
      functionName: string,
      args: (string | number)[],
      argNativeToScValOptions: readonly (
        | MockInvokeHostFunctionArgNativeToScValOptions
        | undefined
      )[] = transferArgOptions,
    ): Operation.InvokeHostFunction {
      const transaction = buildMockInvokeHostFunctionTransaction(
        functionName,
        args,
        {
          source: { accountId: fromAccountId, sequence: '1' },
          networkPassphrase: caip2ChainIdToNetwork(scope),
          contractId,
          argNativeToScValOptions,
        },
      );
      const [operation] = transaction.transactionOperations;
      return operation as Operation.InvokeHostFunction;
    }

    it('parses a valid SEP-41 transfer invoke', () => {
      const operation = buildTransferInvokeOperation('transfer', [
        fromAccountId,
        toAccountId,
        '100',
      ]);

      expect(parseSep41TransferInvoke(operation, scope)).toStrictEqual({
        assetId: toCaip19Sep41AssetId(scope, contractId),
        fromAccountId,
        toAccountId,
        amount: new BigNumber('100'),
      });
    });

    it('returns true from isSep41TransferInvoke for transfer', () => {
      const operation = buildTransferInvokeOperation('transfer', [
        fromAccountId,
        toAccountId,
        '1',
      ]);

      expect(isSep41TransferInvoke(operation)).toBe(true);
    });

    it('returns false from isSep41TransferInvoke for non-transfer invoke', () => {
      const operation = buildTransferInvokeOperation('balance', [
        fromAccountId,
      ]);

      expect(isSep41TransferInvoke(operation)).toBe(false);
    });

    it('throws XdrParseException when function is not transfer', () => {
      const operation = buildTransferInvokeOperation('balance', [
        fromAccountId,
      ]);

      expect(() => parseSep41TransferInvoke(operation, scope)).toThrow(
        XdrParseException,
      );
      expect(() => parseSep41TransferInvoke(operation, scope)).toThrow(
        'Contract is not a transfer function',
      );
    });

    it('throws XdrParseException when transfer has wrong arg count', () => {
      const operation = buildTransferInvokeOperation(
        'transfer',
        [fromAccountId, toAccountId],
        [{ type: 'address' }, { type: 'address' }],
      );

      expect(() => parseSep41TransferInvoke(operation, scope)).toThrow(
        XdrParseException,
      );
      expect(() => parseSep41TransferInvoke(operation, scope)).toThrow(
        'Invalid transfer function arguments',
      );
    });
  });

  describe('parseScValToReadableJson', () => {
    it('decodes address and i128 ScVals to strkey and decimal strings', () => {
      const address =
        'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
      const wrapped = buildMockInvokeHostFunctionTransaction(
        'swap_exact_amount_in',
        [address, 12n],
        {
          argNativeToScValOptions: [{ type: 'address' }, { type: 'i128' }],
        },
      );
      const op = wrapped
        .transactionOperations[0] as Operation.InvokeHostFunction;
      const [addressArg, amountArg] = getInvokeContractArgs(op).args;

      expect(addressArg).toBeDefined();
      expect(amountArg).toBeDefined();
      expect(parseScValToReadableJson(addressArg as xdr.ScVal)).toBe(address);
      expect(parseScValToReadableJson(amountArg as xdr.ScVal)).toBe('12');
    });

    it('decodes SEP-41 approve args with u32 expiration ledger as a string', () => {
      const from = accountAddress;
      const spender = accountAddress;
      const wrapped = buildMockInvokeHostFunctionTransaction(
        'approve',
        [from, spender, 123n, 0],
        {
          argNativeToScValOptions: [
            { type: 'address' },
            { type: 'address' },
            { type: 'i128' },
            { type: 'u32' },
          ],
        },
      );
      const op = wrapped
        .transactionOperations[0] as Operation.InvokeHostFunction;
      const { args } = getInvokeContractArgs(op);

      expect(args).toHaveLength(4);
      expect(parseScValToReadableJson(args[0] as xdr.ScVal)).toBe(from);
      expect(parseScValToReadableJson(args[1] as xdr.ScVal)).toBe(spender);
      expect(parseScValToReadableJson(args[2] as xdr.ScVal)).toBe('123');
      expect(parseScValToReadableJson(args[3] as xdr.ScVal)).toBe('0');
    });

    it('keeps non-zero u32 values as decimal strings', () => {
      const wrapped = buildMockInvokeHostFunctionTransaction(
        'approve',
        [accountAddress, accountAddress, 23n, 123333],
        {
          argNativeToScValOptions: [
            { type: 'address' },
            { type: 'address' },
            { type: 'i128' },
            { type: 'u32' },
          ],
        },
      );
      const op = wrapped
        .transactionOperations[0] as Operation.InvokeHostFunction;
      const expirationArg = getInvokeContractArgs(op).args[3];

      expect(expirationArg).toBeDefined();
      expect(parseScValToReadableJson(expirationArg as xdr.ScVal)).toBe(
        '123333',
      );
    });

    it('decodes approve args from a real envelope XDR', () => {
      const envelopeXdr =
        'AAAAAgAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAMgDpYayAAACcwAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABJbKv015UMxpIkMNjGfee2xjweJ5H/Dh7OzDvLmmlTRoAAAAHYXBwcm92ZQAAAAAEAAAAEgAAAAAAAAAAP0E2QJSc+GJxMnTRfmMMrnZZXknl8DvX1mAEQlMPSLYAAAASAAAAAAAAAAA/QTZAlJz4YnEydNF+YwyudlleSeXwO9fWYARCUw9ItgAAAAoAAAAAAAAAAAAAAAAAAAB7AAAAAwAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
      const tx = TransactionBuilder.fromXdr(envelopeXdr, Networks.PUBLIC);
      const op = tx.operations[0] as Operation.InvokeHostFunction;
      const readableArgs = getInvokeContractArgs(op).args.map((arg) =>
        parseScValToReadableJson(arg),
      );

      expect(readableArgs).toStrictEqual([
        accountAddress,
        accountAddress,
        '123',
        '0',
      ]);
    });

    it('returns base64 XDR when scValToNative fails', () => {
      const scv = xdr.ScVal.scvU32(1);
      Object.defineProperty(scv, 'type', {
        get(): never {
          throw new Error('native conversion failed');
        },
      });

      expect(parseScValToReadableJson(scv)).toBe(scv.toXdr('base64'));
    });

    it('converts bigint, bytes, arrays, and maps for display', () => {
      expect(nativeToReadableJson(23n)).toBe('23');
      expect(nativeToReadableJson(new Uint8Array([0xab, 0xcd]))).toBe('abcd');
      expect(nativeToReadableJson([1n, 'x'])).toBe('["1","x"]');
      const map = new Map<unknown, unknown>([
        ['amount', 5n],
        [10n, true],
      ]);
      expect(nativeToReadableJson(map)).toBe(
        JSON.stringify({ amount: '5', '10': 'true' }),
      );
      expect(nativeToReadableJson(null)).toBe('null');
      expect(nativeToReadableJson(true)).toBe('true');
      expect(nativeToReadableJson({ nested: 7n })).toBe(
        JSON.stringify({ nested: '7' }),
      );
    });
  });

  describe('parseContractEventsFromResultMeta', () => {
    it('accumulates native SAC transfers credited to the wallet', () => {
      const results = parseContractEventsFromResultMeta({
        resultMetaXdr:
          contractSwapReceiveNativeTransactionResponse.result_meta_xdr,
        parseEvent: (event) =>
          parseTransferContractEventSafe(event, accountAddress, scope),
      });

      expect(results).toStrictEqual([
        {
          fromAddress:
            'CCLWL5NYSV2WJQ3VBU44AMDHEVKEPA45N2QP2LL62O3JVKPGWWAQUVAG',
          toAddress: accountAddress,
          assetId: getSlip44AssetId(scope),
          amount: new BigNumber('591762381'),
        },
      ]);
    });

    it('returns an empty array when the wallet is not the transfer recipient', () => {
      expect(
        parseContractEventsFromResultMeta({
          resultMetaXdr:
            contractSwapReceiveNativeTransactionResponse.result_meta_xdr,
          parseEvent: (event) =>
            parseTransferContractEventSafe(
              event,
              'GBX2CFNBNJOLHK3RQXG5RKUMM4WCZ3SRUFZBL6CT76J6CACW7AEZ3SHN',
              scope,
            ),
        }),
      ).toStrictEqual([]);
    });

    it('returns an empty array for invalid meta xdr', () => {
      expect(
        parseContractEventsFromResultMeta({
          resultMetaXdr: 'not-valid-xdr',
          parseEvent: (event) =>
            parseTransferContractEventSafe(event, accountAddress, scope),
        }),
      ).toStrictEqual([]);
    });
  });
});
