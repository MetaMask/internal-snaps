import { ActiveNetwork, isActiveNetwork, Network } from '.';

describe('isActiveNetwork', () => {
  it('returns true for active networks', () => {
    expect(isActiveNetwork(Network.Mainnet)).toBe(true);
  });

  it('returns false for inactive testnets', () => {
    expect(isActiveNetwork(Network.Nile)).toBe(false);
    expect(isActiveNetwork(Network.Shasta)).toBe(false);
  });

  it('returns false for unsupported scopes', () => {
    expect(isActiveNetwork('eip155:1')).toBe(false);
    expect(isActiveNetwork('tron:123456')).toBe(false);
    expect(isActiveNetwork('')).toBe(false);
  });

  it('agrees with the ActiveNetwork record for every network', () => {
    for (const network of Object.values(Network)) {
      expect(isActiveNetwork(network)).toBe(ActiveNetwork[network]);
    }
  });
});
