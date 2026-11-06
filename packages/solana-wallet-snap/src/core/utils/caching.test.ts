import type { ICache, Serializable } from '@metamask/snap-networks-utils';

import { mockLogger } from '../services/__mocks__/logger';
import { useCache } from './caching';

describe('useCache', () => {
  let mockCache: ICache<Serializable>;

  const ttlMilliseconds = 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as ICache<Serializable>;
  });

  it('logs cache get errors using the snap logger', async () => {
    const error = new Error('get failed');
    vi.spyOn(mockCache, 'get').mockRejectedValueOnce(error);

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
    vi.spyOn(mockCache, 'set')
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
    const providedLogger = { error: vi.fn() } as never;
    vi.spyOn(mockCache, 'get').mockRejectedValueOnce(new Error('get failed'));

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
