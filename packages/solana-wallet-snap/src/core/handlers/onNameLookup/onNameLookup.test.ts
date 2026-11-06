import type { Address } from '@solana/kit';
import type { Mocked } from 'vitest';

import { nameResolutionService } from '../../../snapContext';
import { Network } from '../../constants/solana';
import { onNameLookupHandler } from './onNameLookup';

describe('onNameLookupHandler', () => {
  const mockNameResolutionService = nameResolutionService as Mocked<
    typeof nameResolutionService
  >;

  const chainId = Network.Mainnet;
  const resolvedAddress =
    '36Dn3RWhB8x4c83W6ebQ2C2eH9sh5bQX2nMdkP2cWaA4' as Address;

  beforeEach(() => {
    vi.spyOn(nameResolutionService, 'resolveDomain').mockResolvedValue(
      undefined as never,
    );
    vi.spyOn(nameResolutionService, 'resolveAddress').mockResolvedValue(
      undefined as never,
    );
    vi.clearAllMocks();
  });

  it.each(['example.sns', 'example.sol'])(
    'resolves %s domains',
    async (domain) => {
      mockNameResolutionService.resolveDomain.mockResolvedValue(
        resolvedAddress,
      );

      const result = await onNameLookupHandler({
        chainId,
        domain,
      });

      expect(mockNameResolutionService.resolveDomain).toHaveBeenCalledWith(
        chainId,
        domain,
      );
      expect(result).toStrictEqual({
        resolvedAddresses: [
          {
            resolvedAddress,
            protocol: 'Solana Name Service',
            domainName: domain,
          },
        ],
      });
    },
  );

  it.each(['.sns', '.sol', 'example.eth'])(
    'does not resolve invalid or unsupported domain %s',
    async (domain) => {
      const result = await onNameLookupHandler({
        chainId,
        domain,
      });

      expect(mockNameResolutionService.resolveDomain).not.toHaveBeenCalled();
      expect(result).toBeNull();
    },
  );

  it('resolves addresses to domains', async () => {
    mockNameResolutionService.resolveAddress.mockResolvedValue('example.sns');

    const result = await onNameLookupHandler({
      chainId,
      address: resolvedAddress,
    });

    expect(mockNameResolutionService.resolveAddress).toHaveBeenCalledWith(
      chainId,
      resolvedAddress,
    );
    expect(result).toStrictEqual({
      resolvedDomains: [
        {
          resolvedDomain: 'example.sns',
          protocol: 'Solana Name Service',
        },
      ],
    });
  });
});
