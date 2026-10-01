import { InvalidParamsError } from '@metamask/snaps-sdk';

import { KnownCaip19Id, Network } from '../constants';
import { getAssetNetwork } from './getAssetNetwork';

describe('getAssetNetwork', () => {
  it.each([
    [KnownCaip19Id.TrxMainnet, Network.Mainnet],
    [KnownCaip19Id.TrxStakedForEnergyNile, Network.Nile],
    [KnownCaip19Id.BandwidthShasta, Network.Shasta],
  ])('returns the network of %s', (assetType, expected) => {
    expect(getAssetNetwork(assetType)).toBe(expected);
  });

  it('throws for an asset on an unsupported chain', () => {
    expect(() => getAssetNetwork('eip155:1/slip44:60')).toThrow(
      InvalidParamsError,
    );
  });
});
