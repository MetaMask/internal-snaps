import { formatFiat, tokenToFiat } from '../../../utils';
import { defaultPreferences as preferences } from '../__fixtures__/confirmation.fixtures';
import type { FeeData } from '../api';
import { FetchStatus } from '../api';
import { FeeRow } from './Fee';

const fee = {
  assetId: 'stellar:pubnet/slip44:148',
  symbol: 'XLM',
  iconUrl: '',
  amount: '0.00001',
} as FeeData;
const fiat = formatFiat(tokenToFiat(fee.amount, '0.1'), 'usd', 'en');

const render = (props: Partial<Parameters<typeof FeeRow>[0]> = {}): string =>
  JSON.stringify(
    FeeRow({
      fee,
      preferences,
      price: '0.1',
      tokenPricesFetchStatus: FetchStatus.Fetched,
      ...props,
    }),
  );

describe('FeeRow', () => {
  it('renders the fiat value before the fee with the XLM icon', () => {
    const serialized = render();

    expect(serialized).toContain('"children":"0.00001 XLM"');
    expect(serialized).toContain('"type":"Image"');
    expect(serialized.indexOf(fiat)).toBeGreaterThan(-1);
    expect(serialized.indexOf(fiat)).toBeLessThan(
      serialized.indexOf('0.00001 XLM'),
    );
  });

  it('renders a skeleton instead of the fiat value while prices load', () => {
    const serialized = render({
      tokenPricesFetchStatus: FetchStatus.Fetching,
    });

    expect(serialized).toContain('"type":"Skeleton"');
    expect(serialized).not.toContain(fiat);
  });

  it('renders only the fee when there is no price', () => {
    const serialized = render({ price: null });

    expect(serialized).not.toContain(fiat);
    expect(serialized).not.toContain('"type":"Skeleton"');
    expect(serialized).toContain('"children":"0.00001 XLM"');
  });
});
