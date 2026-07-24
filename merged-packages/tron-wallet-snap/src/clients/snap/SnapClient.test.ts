import { SnapClient } from './SnapClient';
import type { ILogger } from '../../utils/logger';

// Mock the global snap object
const mockSnapRequest = jest.fn();
(globalThis as any).snap = {
  request: mockSnapRequest,
};

/**
 * Creates a fresh SnapClient and executes the given test function with it.
 * Resets the `snap.request` mock before each invocation.
 *
 * @param testFn - The test body receiving the client and mock.
 * @returns Whatever the test function returns.
 */
async function withSnapClient(
  testFn: (setup: {
    snapClient: SnapClient;
    mockSnapRequest: jest.Mock;
    mockLogger: jest.Mocked<ILogger>;
  }) => void | Promise<void>,
) {
  mockSnapRequest.mockReset();
  const mockLogger = {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<ILogger>;
  const snapClient = new SnapClient({ logger: mockLogger });
  await testFn({ snapClient, mockSnapRequest, mockLogger });
}

describe('SnapClient', () => {
  describe('getInterfaceContext', () => {
    it('returns context when interface exists', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          const mockContext = { foo: 'bar' };
          mockRequest.mockResolvedValue(mockContext);

          const result = await snapClient.getInterfaceContext('test-id');

          expect(result).toStrictEqual(mockContext);
          expect(mockRequest).toHaveBeenCalledWith({
            method: 'snap_getInterfaceContext',
            params: { id: 'test-id' },
          });
        },
      );
    });

    it('returns null when rawContext is falsy', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockResolvedValue(null);

          const result = await snapClient.getInterfaceContext('test-id');

          expect(result).toBeNull();
        },
      );
    });
  });

  describe('updateInterface', () => {
    it('returns the update result on success', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockResolvedValue(null);

          const result = await snapClient.updateInterface(
            'test-id',
            '<div>test</div>',
            { context: 'data' },
          );

          expect(result).toBeNull();
          expect(mockRequest).toHaveBeenCalledWith({
            method: 'snap_updateInterface',
            params: {
              id: 'test-id',
              ui: '<div>test</div>',
              context: { context: 'data' },
            },
          });
        },
      );
    });
  });

  describe('trackEvent', () => {
    it('tracks event errors without propagating or recursing', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          const trackEventError = new Error('event tracking failed');
          const trackErrorError = new Error('error tracking failed');

          mockRequest
            .mockRejectedValueOnce(trackEventError)
            .mockRejectedValueOnce(trackErrorError);

          const result = await snapClient.trackEvent('Test Event', {
            property: 'value',
          });

          expect(result).toBeUndefined();
          expect(mockRequest).toHaveBeenCalledTimes(2);
          expect(mockRequest).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ method: 'snap_trackEvent' }),
          );
          expect(mockRequest).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ method: 'snap_trackError' }),
          );
        },
      );
    });
  });

  describe('trackError', () => {
    it('returns the Sentry event ID and forwards the serialized error', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest, mockLogger }) => {
          mockRequest.mockResolvedValue('evt_abc123');
          const error = new Error('boom');
          error.name = 'BoomError';

          const result = await snapClient.trackError(error);

          expect(result).toBe('evt_abc123');
          expect(mockRequest).toHaveBeenCalledTimes(1);
          expect(mockRequest).toHaveBeenCalledWith({
            method: 'snap_trackError',
            params: {
              error: expect.objectContaining({
                name: 'BoomError',
                message: 'boom',
                cause: null,
              }),
            },
          });
          expect(mockLogger.warn).not.toHaveBeenCalled();
        },
      );
    });

    it('swallows RPC failures and logs a warning', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest, mockLogger }) => {
          const rpcError = new Error('rpc down');
          mockRequest.mockRejectedValue(rpcError);

          const result = await snapClient.trackError(new Error('x'));

          expect(result).toBeUndefined();
          expect(mockLogger.warn).toHaveBeenCalledTimes(1);
          expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ rpcError }),
            expect.stringContaining('Failed to track error'),
          );
        },
      );
    });

    it('serializes the error cause recursively', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockResolvedValue('evt_xyz');
          const inner = new Error('inner');
          const outer = new Error('outer', { cause: inner });

          await snapClient.trackError(outer);

          expect(mockRequest).toHaveBeenCalledWith({
            method: 'snap_trackError',
            params: {
              error: expect.objectContaining({
                message: 'outer',
                cause: expect.objectContaining({
                  name: 'Error',
                  message: 'inner',
                }),
              }),
            },
          });
        },
      );
    });
  });
});
