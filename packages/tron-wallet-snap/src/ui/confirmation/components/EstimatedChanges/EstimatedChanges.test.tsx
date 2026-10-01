import type { TransactionScanAssetChange } from '../../../../services/transaction-scan/types';
import { FetchStatus } from '../../../../types/snap';
import type { Preferences } from '../../../../types/snap';
import { EstimatedChanges } from './EstimatedChanges';

const preferences = { locale: 'en', currency: 'usd' } as Preferences;

const trxOut: TransactionScanAssetChange = {
  type: 'out',
  value: '10',
  price: null,
  symbol: 'TRX',
  name: 'Tron',
  logo: 'https://example.com/trx.png',
  assetType: 'native',
};

const usdtIn: TransactionScanAssetChange = {
  ...trxOut,
  type: 'in',
  value: '5',
  symbol: 'USDT',
  logo: null,
};

const render = (
  props: Partial<Parameters<typeof EstimatedChanges>[0]>,
): string =>
  JSON.stringify(
    EstimatedChanges({
      changes: { assets: [trxOut, usdtIn] },
      scanStatus: 'SUCCESS',
      preferences,
      scanFetchStatus: FetchStatus.Fetched,
      ...props,
    }),
  );

describe('EstimatedChanges', () => {
  it('renders send and receive rows with translated labels', () => {
    const serialized = render({});

    expect(serialized).toContain('Estimated changes');
    expect(serialized).toContain('You send');
    expect(serialized).toContain('-10 TRX');
    expect(serialized).toContain('You receive');
    expect(serialized).toContain('+5 USDT');
    expect(serialized).toContain(trxOut.logo);
  });

  it.each([FetchStatus.Loading, FetchStatus.Fetching])(
    'renders a skeleton while %s and nothing is estimated yet',
    (scanFetchStatus) => {
      expect(render({ changes: null, scanFetchStatus })).toContain(
        '"type":"Skeleton"',
      );
    },
  );

  it('keeps previously estimated rows visible while re-fetching', () => {
    const serialized = render({ scanFetchStatus: FetchStatus.Fetching });

    expect(serialized).toContain('-10 TRX');
    expect(serialized).not.toContain('"type":"Skeleton"');
  });

  it('renders not available when the scan fetch fails', () => {
    expect(
      render({ changes: null, scanFetchStatus: FetchStatus.Error }),
    ).toContain('Estimated changes are not available');
  });

  it('renders not available when the scan result is an error', () => {
    const serialized = render({
      changes: { assets: [] },
      scanStatus: 'ERROR',
    });

    expect(serialized).toContain('Estimated changes are not available');
    expect(serialized).not.toContain('No estimated changes');
  });

  it('keeps estimated rows visible when the scan result is an error', () => {
    const serialized = render({ scanStatus: 'ERROR' });

    expect(serialized).toContain('-10 TRX');
    expect(serialized).not.toContain('Estimated changes are not available');
  });

  it('renders no changes when fetched without assets', () => {
    expect(render({ changes: { assets: [] } })).toContain(
      'No estimated changes',
    );
  });
});
