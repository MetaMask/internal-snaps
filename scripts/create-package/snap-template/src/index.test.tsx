import type { JsonRpcRequest } from '@metamask/snaps-sdk';
import { Bold, Box, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import { onRpcRequest } from '.';

const request = vi.fn();

describe('onRpcRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('snap', { request });
  });

  it('asks for confirmation on hello', async () => {
    request.mockResolvedValue(true);
    const origin = 'https://example.com';

    expect(
      await onRpcRequest({
        origin,
        request: {
          jsonrpc: '2.0',
          id: 1,
          method: 'hello',
        } as JsonRpcRequest,
      }),
    ).toBe(true);

    expect(request).toHaveBeenCalledWith({
      method: 'snap_dialog',
      params: {
        type: 'confirmation',
        content: (
          <Box>
            <SnapText>
              Hello, <Bold>{origin}</Bold>!
            </SnapText>
            <SnapText>
              This custom confirmation is just for display purposes.
            </SnapText>
            <SnapText>
              But you can edit the snap source code to make it do something, if
              you want to!
            </SnapText>
          </Box>
        ),
      },
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

    expect(request).not.toHaveBeenCalled();
  });
});
