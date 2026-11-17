import { address as asAddress } from '@solana/kit';

import { Network } from '../../../constants/solana';
import { MOCK_SOLANA_KEYRING_ACCOUNT_0 } from '../../../test/mocks/solana-keyring-accounts';
import { EXPECTED_SPAM_TRANSACTION_DATA } from '../../../test/mocks/transactions-data/spam';
import { EXPECTED_SPAM_TRANSACTION_DATA_2 } from '../../../test/mocks/transactions-data/spam-2';
import { mockLogger } from '../../__mocks__/logger';
import type { AssetsService } from '../../assets/AssetsService';
import type { TokenHelper } from '../../assets/TokenHelper';
import { TransactionMapper } from '../TransactionMapper';
import { isSpam } from './isSpam';

/**
 * Narrows away the `null` case of a mapped transaction, so the tests below do
 * not need conditionals of their own.
 *
 * @param value - The value to check.
 * @returns The value, typed without `null` or `undefined`.
 */
const assertDefined = <Value>(value: Value | null | undefined): Value => {
  if (value === null || value === undefined) {
    throw new Error('Expected the mapped transaction to be defined');
  }

  return value;
};

describe('isSpam', () => {
  const scope = Network.Mainnet;
  let transactionMapper: TransactionMapper;

  beforeEach(() => {
    const mockTokenHelper = {
      amountToUiAmountForMint: vi.fn().mockResolvedValue('1'),
    } as unknown as TokenHelper;

    const mockAssetsService = {
      getAssetsMetadata: vi.fn().mockResolvedValue({}),
    } as unknown as AssetsService;

    transactionMapper = new TransactionMapper(
      mockTokenHelper,
      mockAssetsService,
      mockLogger,
    );
  });

  it('returns true if the transaction is a spam transaction - #1', async () => {
    const account = {
      ...MOCK_SOLANA_KEYRING_ACCOUNT_0,
      address: asAddress('DAXnAudMEqiD1sS1rFn4ds3pdybRYJd9J58PqCncVVqS'),
    };

    const transaction = assertDefined(
      await transactionMapper.mapRpcTransaction(
        EXPECTED_SPAM_TRANSACTION_DATA,
        account,
        scope,
      ),
    );

    const result = isSpam(transaction, account);

    expect(result).toBe(true);
  });

  it('returns true if the transaction is a spam transaction - #2', async () => {
    const account = {
      ...MOCK_SOLANA_KEYRING_ACCOUNT_0,
      address: asAddress('FQT9SSwEZ6UUQxsmTzgt5JzjrS4M5zm13M1QiYF8TEo6'),
    };

    const transaction = assertDefined(
      await transactionMapper.mapRpcTransaction(
        EXPECTED_SPAM_TRANSACTION_DATA_2,
        account,
        scope,
      ),
    );

    const result = isSpam(transaction, account);

    expect(result).toBe(true);
  });
});
