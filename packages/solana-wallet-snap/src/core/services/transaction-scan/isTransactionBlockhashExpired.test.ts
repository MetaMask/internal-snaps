import type { Rpc, SolanaRpcApi } from '@solana/kit';

import { fromUnknownBase64StringToTransactionOrTransactionMessage } from '../../sdk-extensions/codecs';
import { trackError } from '../../utils/errors';
import { isTransactionBlockhashExpired } from './isTransactionBlockhashExpired';

jest.mock('../../sdk-extensions/codecs', () => ({
  fromUnknownBase64StringToTransactionOrTransactionMessage: jest.fn(),
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
      .mocked(fromUnknownBase64StringToTransactionOrTransactionMessage)
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
