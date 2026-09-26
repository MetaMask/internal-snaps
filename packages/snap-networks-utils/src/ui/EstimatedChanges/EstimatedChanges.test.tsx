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
      scanFetchStatus: 'fetched',
      ...props,
    }),
  );

describe('EstimatedChanges', () => {
  it.each(['loading', 'fetching'] as const)(
    'renders a skeleton while %s',
    (scanFetchStatus) => {
      const serialized = render({ assets: [out], scanFetchStatus });

      expect(serialized).toContain('"type":"Skeleton"');
      expect(serialized).not.toContain('-10 XLM');
    },
  );

  it('renders not available on error', () => {
    const serialized = render({ assets: [out], scanFetchStatus: 'error' });

    expect(serialized).toContain('Not available');
    expect(serialized).not.toContain('-10 XLM');
  });

  it('renders no changes when fetched without assets', () => {
    expect(render({})).toContain('No changes');
  });

  it('renders only the header before the first fetch', () => {
    const serialized = render({ scanFetchStatus: 'initial' });

    expect(serialized).toContain('Estimated changes');
    expect(serialized).not.toContain('No changes');
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
