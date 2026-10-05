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
import { getMemoValidationErrorKey, getTxnErrorMessageKey } from './utils';

const destinationAddress =
  'GDTF7ERUQVTX23ZD6NY5XRYC5IQAKWFVTQ6IXSMEZWGVNDDGPYCVHRZP';
const senderAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4';
const assetId = USDC_CLASSIC;

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
