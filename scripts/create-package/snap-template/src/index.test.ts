import type { JsonRpcRequest } from '@metamask/snaps-sdk';

import { onRpcRequest } from '.';

const request = vi.fn();

beforeEach(() => {
  vi.stubGlobal('snap', { request });
});

describe('onRpcRequest', () => {
  it('asks for confirmation on hello', async () => {
    request.mockResolvedValue(true);
    const origin = 'https://example.com';

    await expect(
      onRpcRequest({
        origin,
        request: {
          jsonrpc: '2.0',
          id: 1,
          method: 'hello',
        } as JsonRpcRequest,
      }),
    ).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith({
      method: 'snap_dialog',
      params: expect.objectContaining({
        type: 'confirmation',
      }),
    });
  });

  it('throws if the requested method does not exist', async () => {
    await expect(
      onRpcRequest({
        origin: 'https://example.com',
        request: {
          jsonrpc: '2.0',
          id: 1,
          method: 'foo',
        } as JsonRpcRequest,
      }),
    ).rejects.toThrow('Method not found.');
  });
});
