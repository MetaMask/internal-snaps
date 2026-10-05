import type { EstimatedChangesAsset } from './EstimatedChanges';
import { EstimatedChanges } from './EstimatedChanges';

const labels = {
  title: 'Estimated changes',
  tooltip: 'Tooltip',
  send: 'You send',
  receive: 'You receive',
  notAvailable: 'Not available',
  noChanges: 'No changes',
};

const out: EstimatedChangesAsset = {
  type: 'out',
  value: '10',
  symbol: 'XLM',
  logo: null,
};

const inflow: EstimatedChangesAsset = {
  type: 'in',
  value: '5',
  symbol: 'USDC',
  logo: 'https://example.com/usdc.png',
  fiat: '$5.00',
};

const render = (
  props: Partial<Parameters<typeof EstimatedChanges>[0]>,
): string =>
  JSON.stringify(
    EstimatedChanges({
      assets: [],
      labels,
      isFetching: false,
      isUnavailable: false,
      ...props,
    }),
  );

describe('EstimatedChanges', () => {
  it('renders a skeleton while fetching and nothing is seeded', () => {
    expect(render({ isFetching: true })).toContain('"type":"Skeleton"');
  });

  it('renders not available when unavailable and nothing is seeded', () => {
    const serialized = render({ isUnavailable: true });

    expect(serialized).toContain('Not available');
    expect(serialized).not.toContain('No changes');
  });

  it.each([{ isFetching: true }, { isUnavailable: true }])(
    'keeps seeded rows visible for %o',
    (props) => {
      const serialized = render({ assets: [out], ...props });

      expect(serialized).toContain('-10 XLM');
      expect(serialized).not.toContain('"type":"Skeleton"');
      expect(serialized).not.toContain('Not available');
    },
  );

  it('renders no changes when there are no assets', () => {
    expect(render({})).toContain('No changes');
  });

  it('renders send and receive rows', () => {
    const serialized = render({ assets: [out, inflow] });

    expect(serialized).toContain('You send');
    expect(serialized).toContain('-10 XLM');
    expect(serialized).toContain('"color":"error"');
    expect(serialized).toContain('You receive');
    expect(serialized).toContain('+5 USDC');
    expect(serialized).toContain('"color":"success"');
    expect(serialized).toContain(inflow.logo);
    expect(serialized).toContain('$5.00');
  });

  it('renders a neutral placeholder for an unknown amount', () => {
    const serialized = render({ assets: [{ ...out, value: null }] });

    expect(serialized).toContain('– XLM');
    expect(serialized).not.toContain('"color":"error"');
    expect(serialized).not.toContain('You receive');
  });
});
