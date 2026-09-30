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
      scanStatus: 'SUCCESS',
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

  it('renders not available when the scan result is an error', () => {
    const serialized = render({ changes: null, scanStatus: 'ERROR' });

    expect(serialized).toContain('Not available');
    expect(serialized).not.toContain('No changes');
  });

  it('renders no changes when there are no estimated changes', () => {
    expect(render({ changes: null })).toContain('No changes');
  });
});
