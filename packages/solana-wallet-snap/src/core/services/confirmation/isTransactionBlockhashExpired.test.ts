import type {
  TransactionMessage,
  Nonce,
  Rpc,
  SolanaRpcApi,
  Transaction,
  TransactionMessageBytes,
} from '@solana/kit';
import {
  address,
  blockhash as toBlockhash,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageLifetimeUsingDurableNonce,
} from '@solana/kit';

import {
  fromBytesToCompilableTransactionMessage,
  fromUnknownBase64StringToTransactionOrTransactionMessage,
} from '../../sdk-extensions/codecs';
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
  const blockhash = toBlockhash('11111111111111111111111111111111');
  const feePayer = address('BLw3RweJmfbTapJRgnPRvd962YDjFYAnVGd1p5hmZ5tP');

  const getRpc = (): Rpc<SolanaRpcApi> =>
    ({ isBlockhashValid: jest.fn() }) as unknown as Rpc<SolanaRpcApi>;

  const getMessageWithBlockhashLifetime = (): TransactionMessage =>
    pipe(
      createTransactionMessage({ version: 0 }),
      (message) => setTransactionMessageFeePayer(feePayer, message),
      (message) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash, lastValidBlockHeight: 42n },
          message,
        ),
    );

  const getMessageWithDurableNonceLifetime = (): TransactionMessage =>
    pipe(
      createTransactionMessage({ version: 0 }),
      (message) => setTransactionMessageFeePayer(feePayer, message),
      (message) =>
        setTransactionMessageLifetimeUsingDurableNonce(
          {
            nonce: blockhash as unknown as Nonce,
            nonceAccountAddress: feePayer,
            nonceAuthorityAddress: feePayer,
          },
          message,
        ),
    );

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

  it('returns false when a compilable message has a valid recent blockhash', async () => {
    const rpc = getRpc();
    jest
      .mocked(fromUnknownBase64StringToTransactionOrTransactionMessage)
      .mockResolvedValue(getMessageWithBlockhashLifetime());
    const send = jest.fn().mockResolvedValue({ value: true });
    jest.mocked(rpc.isBlockhashValid).mockReturnValue({ send } as never);

    expect(await isTransactionBlockhashExpired('message', rpc)).toBe(false);

    expect(rpc.isBlockhashValid).toHaveBeenCalledWith(blockhash);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns true when a transaction has an expired recent blockhash', async () => {
    const rpc = getRpc();
    const transaction: Transaction = {
      messageBytes: new Uint8Array() as unknown as TransactionMessageBytes,
      signatures: {},
    };
    jest
      .mocked(fromUnknownBase64StringToTransactionOrTransactionMessage)
      .mockResolvedValue(transaction);
    jest
      .mocked(fromBytesToCompilableTransactionMessage)
      .mockResolvedValue(getMessageWithBlockhashLifetime());
    const send = jest.fn().mockResolvedValue({ value: false });
    jest.mocked(rpc.isBlockhashValid).mockReturnValue({ send } as never);

    expect(await isTransactionBlockhashExpired('transaction', rpc)).toBe(true);

    expect(fromBytesToCompilableTransactionMessage).toHaveBeenCalledWith(
      transaction.messageBytes,
      rpc,
    );
    expect(rpc.isBlockhashValid).toHaveBeenCalledWith(blockhash);
  });

  it('does not check a durable-nonce lifetime against the recent-blockhash cache', async () => {
    const rpc = getRpc();
    jest
      .mocked(fromUnknownBase64StringToTransactionOrTransactionMessage)
      .mockResolvedValue(getMessageWithDurableNonceLifetime());

    expect(
      await isTransactionBlockhashExpired('durable-nonce-message', rpc),
    ).toBe(false);

    expect(rpc.isBlockhashValid).not.toHaveBeenCalled();
  });
});
