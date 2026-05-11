import { SnapClient } from './SnapClient';

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
  }) => void | Promise<void>,
) {
  mockSnapRequest.mockReset();
  const snapClient = new SnapClient();
  await testFn({ snapClient, mockSnapRequest });
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
});
