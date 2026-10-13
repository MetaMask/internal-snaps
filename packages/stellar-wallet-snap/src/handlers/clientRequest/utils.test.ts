import { Networks } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';

import { CONFIRMED_TRANSACTION_FEE_BUFFER_RATIO } from '../../constants';
import { USDC_CLASSIC } from '../../services/asset-metadata/__mocks__/assets.fixtures';
import {
  InsufficientBalanceException,
  InsufficientBalanceToCoverBaseReserveException,
  InsufficientBalanceToCoverFeeException,
  InvalidAmountForCreateAccountException,
  InvalidAssetForCreateAccountException,
  InvalidMemoException,
  RemoveTrustlineWithNonZeroBalanceException,
  RequiresMemoException,
  TransactionExpireException,
  TransactionValidationException,
  TrustlineExceedLimitException,
  TrustlineNotAuthorizedException,
  TrustlineNotFoundException,
  UpdateTrustlineException,
} from '../../services/transaction';
import { buildMockClassicTransaction } from '../../services/transaction/__mocks__/transaction.fixtures';
import {
  assertRefreshedTransactionFeeWithinBuffer,
  getMemoValidationErrorKey,
  getTxnErrorMessageKey,
} from './utils';

const destinationAddress =
  'GDTF7ERUQVTX23ZD6NY5XRYC5IQAKWFVTQ6IXSMEZWGVNDDGPYCVHRZP';
const senderAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4';
const assetId = USDC_CLASSIC;

function buildFeeTransaction(baseFeePerOperation: string) {
  return buildMockClassicTransaction(
    [
      {
        type: 'payment',
        params: {
          destination: destinationAddress,
          asset: 'native',
          amount: '1',
        },
      },
    ],
    { networkPassphrase: Networks.TESTNET, baseFeePerOperation },
  );
}

function feeAtBufferLimit(confirmedFee: string): string {
  return new BigNumber(confirmedFee)
    .multipliedBy(CONFIRMED_TRANSACTION_FEE_BUFFER_RATIO)
    .toFixed(0);
}

function feeJustOverBuffer(confirmedFee: string): string {
  return new BigNumber(feeAtBufferLimit(confirmedFee)).plus(1).toFixed(0);
}

describe('assertRefreshedTransactionFeeWithinBuffer', () => {
  const confirmedFee = '100';

  it('allows a refreshed fee within the 20% buffer', () => {
    expect(() =>
      assertRefreshedTransactionFeeWithinBuffer({
        confirmedTransaction: buildFeeTransaction(confirmedFee),
        refreshedTransaction: buildFeeTransaction(
          feeAtBufferLimit(confirmedFee),
        ),
      }),
    ).not.toThrow();
  });

  it('allows a refreshed fee lower than the confirmed fee', () => {
    expect(() =>
      assertRefreshedTransactionFeeWithinBuffer({
        confirmedTransaction: buildFeeTransaction(confirmedFee),
        refreshedTransaction: buildFeeTransaction('50'),
      }),
    ).not.toThrow();
  });

  it('throws when the refreshed fee exceeds the 20% buffer', () => {
    expect(() =>
      assertRefreshedTransactionFeeWithinBuffer({
        confirmedTransaction: buildFeeTransaction(confirmedFee),
        refreshedTransaction: buildFeeTransaction(
          feeJustOverBuffer(confirmedFee),
        ),
      }),
    ).toThrow(TransactionValidationException);
  });
});

describe('getTxnErrorMessageKey', () => {
  it.each([
    {
      error: new InvalidMemoException(),
      message: 'confirmation.memo.error.tooLong',
    },
    {
      error: new InsufficientBalanceException('0', '1'),
      message: 'confirmation.txnError.insufficientBalance',
    },
    {
      error: new InsufficientBalanceToCoverFeeException('0', '1'),
      message: 'confirmation.txnError.insufficientBalanceToCoverFee',
    },
    {
      error: new InsufficientBalanceToCoverBaseReserveException('0', '1'),
      message: 'confirmation.txnError.insufficientBalanceToCoverBaseReserve',
    },
    {
      error: new RequiresMemoException(destinationAddress),
      message: 'confirmation.txnError.requiresMemo',
    },
    {
      error: new InvalidAmountForCreateAccountException('0.5'),
      message: 'confirmation.txnError.invalidCreateAccountAmount',
    },
    {
      error: new InvalidAssetForCreateAccountException(assetId),
      message: 'confirmation.txnError.invalidCreateAccountAsset',
    },
    {
      error: new TrustlineNotAuthorizedException(assetId, destinationAddress),
      message: 'confirmation.txnError.trustlineNotAuthorized',
    },
    {
      error: new TrustlineNotFoundException(assetId, destinationAddress),
      message: 'confirmation.txnError.trustlineNotFound',
    },
    {
      error: new TrustlineExceedLimitException(assetId),
      message: 'confirmation.txnError.trustlineExceedLimit',
    },
    {
      error: new RemoveTrustlineWithNonZeroBalanceException('balance'),
      message: 'confirmation.txnError.trustlineNonZeroBalance',
    },
    {
      error: new UpdateTrustlineException('limit'),
      message: 'confirmation.txnError.updateTrustlineLimit',
    },
    {
      error: new TransactionExpireException(0),
      message: 'confirmation.txnError.expired',
    },
    {
      error: new TransactionValidationException('unknown'),
      message: 'confirmation.txnError.generic',
    },
    {
      error: new TrustlineNotFoundException(assetId, senderAddress),
      senderAddress,
      message: 'confirmation.txnError.trustlineNotFoundOnAccount',
    },
  ])('maps $message', ({ error, senderAddress: sender, message }) => {
    expect(getTxnErrorMessageKey(error, sender ?? senderAddress)).toBe(message);
  });
});

describe('getMemoValidationErrorKey', () => {
  it('returns null for empty or whitespace-only values', () => {
    expect(getMemoValidationErrorKey('')).toBeNull();
    expect(getMemoValidationErrorKey('   ')).toBeNull();
  });

  it('returns null for valid memo id and text values', () => {
    expect(getMemoValidationErrorKey('9876543210')).toBeNull();
    expect(getMemoValidationErrorKey('deposit-ref')).toBeNull();
    expect(getMemoValidationErrorKey('18446744073709551616')).toBeNull();
  });

  it('returns tooLong when the value exceeds 28 UTF-8 bytes', () => {
    expect(getMemoValidationErrorKey('é'.repeat(15))).toBe(
      'confirmation.memo.error.tooLong',
    );
  });
});
