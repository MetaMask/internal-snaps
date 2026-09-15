import { assert, StructError } from '@metamask/superstruct';
import {
  Account,
  Asset,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  hash,
  xdr,
} from '@stellar/stellar-sdk';

import { bufferToUint8Array } from '../utils/buffer';
import { buildAuthEntryPreimageXdr } from './__mocks__/xdr.fixtures';
import { HashIdPreimageXdrStruct, SwapTransactionXdrStruct } from './xdr';

const sourceAddress =
  'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO';
const contractId = 'CASUP2OPFVEHCWGP2XLBXOV7DQIQIT42AQISG4MXAZGNLVFFN63X7WRT';

const issuer = Keypair.random().publicKey();
const destination = Keypair.random().publicKey();
const bridgeDestination = Keypair.random().publicKey();
const feeDestination = Keypair.random().publicKey();
const usdc = new Asset('USDC', issuer);

/**
 * Builds a transaction XDR from Stellar operations.
 *
 * @param operations - Operations to add in order.
 * @returns Base64 transaction envelope XDR.
 */
function buildTransactionXdr(operations: xdr.Operation[]): string {
  const builder = new TransactionBuilder(new Account(sourceAddress, '1'), {
    fee: '100',
    networkPassphrase: Networks.PUBLIC,
  });

  for (const operation of operations) {
    builder.addOperation(operation);
  }

  return builder.setTimeout(60).build().toXdr();
}

describe('SwapTransactionXdrStruct', () => {
  it.each([
    buildTransactionXdr([new Contract(contractId).call('swap')]),
    buildTransactionXdr([
      Operation.payment({
        destination: bridgeDestination,
        asset: Asset.native(),
        amount: '1',
      }),
    ]),
    buildTransactionXdr([
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: '10',
        destination,
        destAsset: usdc,
        destMin: '5',
      }),
    ]),
    buildTransactionXdr([
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: '10',
        destination,
        destAsset: usdc,
        destAmount: '5',
      }),
    ]),
    buildTransactionXdr([
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: '10',
        destination,
        destAsset: usdc,
        destMin: '5',
      }),
      Operation.payment({
        destination: feeDestination,
        asset: Asset.native(),
        amount: '1',
      }),
    ]),
    buildTransactionXdr([
      Operation.changeTrust({
        asset: usdc,
        limit: '1000',
      }),
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: '10',
        destination: sourceAddress,
        destAsset: usdc,
        destMin: '5',
      }),
    ]),
    buildTransactionXdr([
      Operation.changeTrust({
        asset: usdc,
        limit: '1000',
      }),
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: '10',
        destination: sourceAddress,
        destAsset: usdc,
        destAmount: '5',
      }),
    ]),
    buildTransactionXdr([
      Operation.changeTrust({
        asset: usdc,
        limit: '1000',
      }),
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: '10',
        destination: sourceAddress,
        destAsset: usdc,
        destMin: '5',
      }),
      Operation.payment({
        destination: feeDestination,
        asset: Asset.native(),
        amount: '1',
      }),
    ]),
  ])('accepts a valid swap transaction XDR', (xdr) => {
    expect(() => assert(xdr, SwapTransactionXdrStruct)).not.toThrow();
  });

  it.each([
    'not-xdr',
    buildTransactionXdr([
      Operation.pathPaymentStrictSend({
        sendAsset: Asset.native(),
        sendAmount: '10',
        destination: sourceAddress,
        destAsset: usdc,
        destMin: '5',
      }),
      Operation.changeTrust({
        asset: usdc,
        limit: '1000',
      }),
      Operation.payment({
        destination: feeDestination,
        asset: Asset.native(),
        amount: '1',
      }),
    ]),
  ])('rejects an invalid swap transaction XDR', (xdr) => {
    expect(() => assert(xdr, SwapTransactionXdrStruct)).toThrow(StructError);
  });
});

describe('HashIdPreimageXdrStruct', () => {
  const boundAddress = Keypair.random().publicKey();

  it.each([
    ['v1', buildAuthEntryPreimageXdr()],
    ['v2', buildAuthEntryPreimageXdr({ boundAddress })],
  ])('accepts a mainnet %s Soroban authorization preimage', (_label, value) => {
    expect(() => assert(value, HashIdPreimageXdrStruct)).not.toThrow();
  });

  it.each([
    ['v1', buildAuthEntryPreimageXdr({ networkPassphrase: Networks.TESTNET })],
    [
      'v2',
      buildAuthEntryPreimageXdr({
        networkPassphrase: Networks.TESTNET,
        boundAddress,
      }),
    ],
    [
      'contract id',
      xdr.HashIdPreimage.envelopeTypeContractId(
        new xdr.HashIdPreimageContractId({
          networkId: hash(bufferToUint8Array(Networks.PUBLIC, 'utf8')),
          contractIdPreimage:
            xdr.ContractIdPreimage.contractIdPreimageFromAsset(
              xdr.Asset.assetTypeNative(),
            ),
        }),
      ).toXdr('base64'),
    ],
  ])('rejects a %s HashIdPreimage', (_label, value) => {
    expect(() => assert(value, HashIdPreimageXdrStruct)).toThrow(StructError);
  });
});
