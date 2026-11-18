import type { TransactionScanAssetChange } from '../../../../core/services/transaction-scan/types';
import type { Preferences } from '../../../../core/types/snap';
import { EstimatedChanges } from './EstimatedChanges';

const preferences = { locale: 'en', currency: 'usd' } as Preferences;

const sol: TransactionScanAssetChange = {
  type: 'out',
  value: 1.5,
  price: 300,
  symbol: 'SOL',
  name: 'Solana',
  logo: 'https://example.com/sol.png',
};

const render = (
  props: Partial<Parameters<typeof EstimatedChanges>[0]>,
): string =>
  JSON.stringify(
    EstimatedChanges({
      changes: { assets: [sol] },
      scanFetchStatus: 'fetched',
      preferences,
      ...props,
    }),
  );

describe('EstimatedChanges', () => {
  it('renders formatted amounts, fiat and translated labels', () => {
    const serialized = render({});

    expect(serialized).toContain('Estimated changes');
    expect(serialized).toContain('You send');
    expect(serialized).toContain('-1.5 SOL');
    expect(serialized).toContain('$300.00');
    expect(serialized).toContain(sol.logo);
  });

  it('omits fiat when the asset has no price', () => {
    const serialized = render({
      changes: { assets: [{ ...sol, price: null }] },
    });

    expect(serialized).not.toContain('$');
  });

  it('renders a skeleton while fetching and nothing is estimated yet', () => {
    expect(render({ changes: null, scanFetchStatus: 'fetching' })).toContain(
      '"type":"Skeleton"',
    );
  });

  it('renders not available when the scan fetch fails', () => {
    expect(render({ changes: null, scanFetchStatus: 'error' })).toContain(
      'Not available',
    );
  });

  it.each([
    { scanFetchStatus: 'fetching' },
    { scanFetchStatus: 'error' },
  ] as const)('keeps previously estimated rows visible for %o', (props) => {
    const serialized = render(props);

    expect(serialized).toContain('-1.5 SOL');
    expect(serialized).not.toContain('"type":"Skeleton"');
    expect(serialized).not.toContain('Not available');
  });

  it('renders no changes when simulation returned an empty asset diff', () => {
    expect(render({ changes: { assets: [] } })).toContain('No changes');
  });

  it('renders not available when simulation did not return a result', () => {
    const serialized = render({ changes: null });

    expect(serialized).toContain('Not available');
    expect(serialized).not.toContain('No changes');
  });
});
