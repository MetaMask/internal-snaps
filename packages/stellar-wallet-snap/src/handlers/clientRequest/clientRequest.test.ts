import { MethodNotFoundError } from '@metamask/snaps-sdk';

import { ClientRequestMethod } from './api';
import { ClientRequestHandler } from './clientRequest';

describe('ClientRequestHandler', () => {
  const mockHandle = jest.fn();

  function setup(): ClientRequestHandler {
    mockHandle.mockReset();
    return new ClientRequestHandler({
      handlers: {
        [ClientRequestMethod.ConfirmSend]: { handle: mockHandle },
      } as never,
    });
  }

  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: ClientRequestMethod.ConfirmSend,
    params: {
      fromAccountId: '11111111-1111-4111-8111-111111111111',
      toAddress: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      assetId: 'stellar:pubnet/slip44:148',
      amount: '1',
    },
  } as const;

  it('routes the request to the handler for its method', async () => {
    const handler = setup();
    mockHandle.mockResolvedValue({ fee: '100' });

    expect(await handler.handle(request)).toStrictEqual({ fee: '100' });
    expect(mockHandle).toHaveBeenCalledWith(request);
  });

  it('returns null when the method handler returns nothing', async () => {
    const handler = setup();
    mockHandle.mockResolvedValue(undefined);

    expect(await handler.handle(request)).toBeNull();
  });

  it('throws MethodNotFoundError for an unknown method', async () => {
    const handler = setup();

    await expect(
      handler.handle({ ...request, method: 'unknownMethod' }),
    ).rejects.toThrow(MethodNotFoundError);
    expect(mockHandle).not.toHaveBeenCalled();
  });
});
