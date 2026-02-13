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
  describe('getInterfaceContextIfExists', () => {
    it('returns context when interface exists', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          const mockContext = { foo: 'bar' };
          mockRequest.mockResolvedValue(mockContext);

          const result =
            await snapClient.getInterfaceContextIfExists('test-id');

          expect(result).toStrictEqual(mockContext);
          expect(mockRequest).toHaveBeenCalledWith({
            method: 'snap_getInterfaceContext',
            params: { id: 'test-id' },
          });
        },
      );
    });

    it('returns null when interface is not found', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockRejectedValue(
            new Error('Interface with id "xyz" not found'),
          );

          const result = await snapClient.getInterfaceContextIfExists('xyz');

          expect(result).toBeNull();
        },
      );
    });

    it('re-throws non-interface-not-found errors', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockRejectedValue(new Error('Network timeout'));

          await expect(
            snapClient.getInterfaceContextIfExists('test-id'),
          ).rejects.toThrow('Network timeout');
        },
      );
    });

    it('re-throws when the rejection is not an Error instance', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockRejectedValue('unexpected string rejection');

          await expect(
            snapClient.getInterfaceContextIfExists('test-id'),
          ).rejects.toBe('unexpected string rejection');
        },
      );
    });
  });

  describe('updateInterfaceIfExists', () => {
    it('returns true when update succeeds', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          // SDK returns null for snap_updateInterface, but our wrapper returns true
          mockRequest.mockResolvedValue(null);

          const result = await snapClient.updateInterfaceIfExists(
            'test-id',
            '<div>test</div>',
            { context: 'data' },
          );

          expect(result).toBe(true);
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

    it('returns null when interface is not found', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockRejectedValue(
            new Error('Interface with id "xyz" not found'),
          );

          const result = await snapClient.updateInterfaceIfExists(
            'xyz',
            '<div>test</div>',
            { context: 'data' },
          );

          expect(result).toBeNull();
        },
      );
    });

    it('re-throws non-interface-not-found errors', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockRejectedValue(new Error('Network timeout'));

          await expect(
            snapClient.updateInterfaceIfExists('test-id', '<div>test</div>', {
              context: 'data',
            }),
          ).rejects.toThrow('Network timeout');
        },
      );
    });

    it('re-throws when the rejection is not an Error instance', async () => {
      await withSnapClient(
        async ({ snapClient, mockSnapRequest: mockRequest }) => {
          mockRequest.mockRejectedValue('unexpected string rejection');

          await expect(
            snapClient.updateInterfaceIfExists('test-id', '<div>test</div>', {
              context: 'data',
            }),
          ).rejects.toBe('unexpected string rejection');
        },
      );
    });
  });
});
