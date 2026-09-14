import type { ICache, Serializable } from '@metamask/snap-networks-utils';

import { mockLogger } from '../services/__mocks__/logger';
import { useCache } from './caching';

jest.mock('./logger', () => ({
  __esModule: true,
  default: mockLogger,
  noOpLogger: mockLogger,
}));

describe('useCache', () => {
  let mockCache: ICache<Serializable>;

  const ttlMilliseconds = 60 * 1000;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as ICache<Serializable>;
  });

  it('logs cache get errors using the snap logger', async () => {
    const error = new Error('get failed');
    jest.spyOn(mockCache, 'get').mockRejectedValueOnce(error);

    const cachedFn = useCache(async () => 'result', mockCache, {
      functionName: 'testFunction',
      ttlMilliseconds,
    });

    const promise = cachedFn();
    expect(await promise).toBe('result');
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Cache get error for key "testFunction:":',
      error,
    );
  });

  it('logs cache set errors using the snap logger', async () => {
    const error = new Error('set failed');
    jest
      .spyOn(mockCache, 'set')
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);

    const cachedFn = useCache(async () => 'result', mockCache, {
      functionName: 'testFunction',
      ttlMilliseconds,
    });

    const promise = cachedFn();
    expect(await promise).toBe('result');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Cache set error for key "testFunction:":',
      error,
    );
  });

  it('uses the provided logger over the snap logger', async () => {
    const providedLogger = { error: jest.fn() } as never;
    jest.spyOn(mockCache, 'get').mockRejectedValueOnce(new Error('get failed'));

    const cachedFn = useCache(async () => 'result', mockCache, {
      functionName: 'testFunction',
      ttlMilliseconds,
      logger: providedLogger,
    });

    const promise = cachedFn();
    expect(await promise).toBe('result');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
