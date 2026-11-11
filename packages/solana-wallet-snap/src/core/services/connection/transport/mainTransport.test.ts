import * as snapNetworksUtils from '@metamask/snap-networks-utils';

import { Network } from '../../../constants/solana';
import { analyticsService } from '../../../utils/analytics';
import { trackError } from '../../../utils/errors';
import logger from '../../../utils/logger';
import { createMainTransport } from './mainTransport';

describe('createMainTransport', () => {
  it('reports RPC outages through the fetch policy', () => {
    const createFetchPolicySpy = vi.spyOn(
      snapNetworksUtils,
      'createFetchPolicy',
    );

    createMainTransport(['https://rpc.example'], Network.Mainnet, logger);

    expect(createFetchPolicySpy).toHaveBeenCalledWith({
      service: 'solana_rpc',
      chainIdCaip: Network.Mainnet,
      logger,
      analytics: analyticsService,
      trackError,
    });
  });

  it('throws when no RPC URL is configured', () => {
    expect(() => createMainTransport([], Network.Mainnet, logger)).toThrow(
      'At least one Solana RPC URL is required.',
    );
  });
});
