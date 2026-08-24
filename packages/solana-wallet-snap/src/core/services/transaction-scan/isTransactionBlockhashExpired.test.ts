import type { Rpc, SolanaRpcApi } from '@solana/kit';

import { fromUnknowBase64StringToTransactionOrTransactionMessage } from '../../sdk-extensions/codecs';
import { trackError } from '../../utils/errors';
import { isTransactionBlockhashExpired } from './isTransactionBlockhashExpired';

jest.mock('../../sdk-extensions/codecs', () => ({
  fromUnknowBase64StringToTransactionOrTransactionMessage: jest.fn(),
  fromBytesToCompilableTransactionMessage: jest.fn(),
}));

jest.mock('../../utils/errors', () => ({
  trackError: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    withPrefix: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

describe('isTransactionBlockhashExpired', () => {
  it('tracks a failure and treats the transaction as not expired', async () => {
    const error = new Error('RPC unavailable');
    jest
      .mocked(fromUnknowBase64StringToTransactionOrTransactionMessage)
      .mockRejectedValue(error);

    expect(
      await isTransactionBlockhashExpired(
        'transaction',
        {} as Rpc<SolanaRpcApi>,
      ),
    ).toBe(false);

    expect(trackError).toHaveBeenCalledWith(error);
  });
});
