import { is } from '@metamask/superstruct';

import { Network } from './core/constants/solana';
import { SolanaWalletRequestStruct } from './core/services/wallet/structs';
import { getSnapProvider } from './core/utils/snap';
import {
  onClientRequest,
  onKeyringRequest,
  onProtocolRequest,
  onRpcRequest,
} from './index';
import { clientRequestHandler } from './snapContext';

// These boundary tests do not use cryptography. Keep importing the entrypoints
// from changing the global crypto implementation shared by the other suites.
vi.mock('./polyfills', () => ({ installPolyfills: vi.fn() }));

const signedResponse = {
  signedTransaction: 'c2lnbmVkLXRyYW5zYWN0aW9u',
  signature: 'signature',
};

const operations = [
  { method: 'signPackPartnerBuy', result: signedResponse },
] as const;

const origins = ['https://example.com', 'http://localhost:3000', 'metamask'];

describe.each(operations)('$method exposure', ({ method, result }) => {
  const request = { id: 1, jsonrpc: '2.0' as const, method, params: {} };

  beforeEach(() => {
    vi.spyOn(clientRequestHandler, 'handle').mockResolvedValue(result);
    vi.spyOn(getSnapProvider(), 'request').mockResolvedValue(null);
  });

  it('routes the request through the client entrypoint', async () => {
    expect(await onClientRequest({ request })).toStrictEqual(result);
    expect(clientRequestHandler.handle).toHaveBeenCalledExactlyOnceWith(
      request,
    );
  });

  it.each(origins)('rejects invocation through RPC from %s', async (origin) => {
    await expect(
      onRpcRequest({ origin, originMetadata: null, request }),
    ).rejects.toThrow('Permission denied');
    expect(clientRequestHandler.handle).not.toHaveBeenCalled();
  });

  it.each(origins)(
    'rejects invocation through the keyring entrypoint from %s',
    async (origin) => {
      await expect(
        onKeyringRequest({ origin, originMetadata: null, request }),
      ).rejects.toThrow('Permission denied');
      expect(clientRequestHandler.handle).not.toHaveBeenCalled();
    },
  );

  it('is not a supported Multichain wallet request', () => {
    expect(is({ method, params: {} }, SolanaWalletRequestStruct)).toBe(false);
  });

  it('rejects invocation through the Multichain protocol entrypoint', async () => {
    await expect(
      onProtocolRequest({
        origin: 'https://example.com',
        originMetadata: null,
        scope: Network.Mainnet,
        request,
      }),
    ).rejects.toThrow(`Unsupported method: ${method}`);
    expect(clientRequestHandler.handle).not.toHaveBeenCalled();
  });
});
