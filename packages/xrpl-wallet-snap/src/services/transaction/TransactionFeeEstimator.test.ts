import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import { BASE_RESERVE_DROPS } from '../../constants';
import type { NetworkService } from '../network';
import { Transaction } from './Transaction';
import { TransactionFeeEstimator } from './TransactionFeeEstimator';

const scope = KnownCaip2ChainId.Mainnet;
const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const multiplier = 10;

function estimator(baseFee: number): TransactionFeeEstimator {
  const networkService = {
    getBaseFee: vi.fn(async () => new BigNumber(baseFee)),
  } as unknown as NetworkService;
  return new TransactionFeeEstimator({ networkService });
}

function payment(): Transaction {
  return new Transaction(
    {
      TransactionType: 'Payment',
      Account: account,
      Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      Amount: '10',
    },
    scope,
  );
}

describe('TransactionFeeEstimator', () => {
  it('multiplies the network fee and skips cache by default', async () => {
    const networkService = {
      getBaseFee: vi.fn(async () => new BigNumber(12)),
    } as unknown as NetworkService;
    const feeEstimator = new TransactionFeeEstimator({ networkService });

    const fee = await feeEstimator.getBaseFee(scope);
    expect(fee).toStrictEqual(new BigNumber(12 * multiplier));
    expect(networkService.getBaseFee).toHaveBeenCalledWith(scope, {
      cache: false,
    });
  });

  it('reuses the cached base fee when useCache is true', async () => {
    const networkService = {
      getBaseFee: vi.fn(async () => new BigNumber(12)),
    } as unknown as NetworkService;
    const feeEstimator = new TransactionFeeEstimator({ networkService });

    await feeEstimator.getBaseFee(scope, { useCache: true });
    expect(networkService.getBaseFee).toHaveBeenCalledWith(scope, {
      cache: true,
    });
  });

  it('caps a scaled fee at 2 XRP', async () => {
    const fee = await estimator(1_000_000).estimateFee({
      transaction: payment(),
      scope,
    });
    expect(fee).toStrictEqual(new BigNumber(2_000_000));
  });

  it('prices AccountDelete at one owner reserve', async () => {
    const transaction = new Transaction(
      { TransactionType: 'AccountDelete', Account: account },
      scope,
    );

    const fee = await estimator(12).estimateFee({ transaction, scope });
    expect(fee).toStrictEqual(new BigNumber(BASE_RESERVE_DROPS));
  });

  it('prices a batch as two reference fees plus each inner', async () => {
    const transaction = new Transaction(
      {
        TransactionType: 'Batch',
        Account: account,
        RawTransactions: [
          {
            RawTransaction: {
              TransactionType: 'Payment',
              Account: account,
              Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
              Amount: '10',
            },
          },
        ],
      },
      scope,
    );
    const reference = 12 * multiplier;

    const fee = await estimator(12).estimateFee({ transaction, scope });
    expect(fee).toStrictEqual(new BigNumber(reference * 2 + reference));
  });
});
