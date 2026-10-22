import { FeeType } from '@metamask/keyring-api';

import { KnownCaip19Id } from '../../../constants';
import type { ComputeFeeResult } from '../../../services/send/types';
import { FetchStatus } from '../../../types/snap';
import type { Preferences } from '../../../types/snap';
import { formatFiat } from '../../../utils/formatFiat';
import { tokenToFiat } from '../../../utils/tokenToFiat';
import { Fees } from './Fees';

const preferences = {
  locale: 'en',
  currency: 'usd',
} as Preferences;

const trxFee = {
  type: FeeType.Base,
  asset: {
    unit: 'TRX',
    type: KnownCaip19Id.TrxMainnet,
    amount: '1.5',
    fungible: true,
    iconUrl: 'https://icon.example/trx.png',
  },
} as ComputeFeeResult[number];

const resourceFee = (unit: string, type: string): ComputeFeeResult[number] =>
  ({
    type: FeeType.Base,
    asset: { unit, type, amount: '100', fungible: true },
  }) as ComputeFeeResult[number];

const tokenPrices = {
  [KnownCaip19Id.TrxMainnet]: { price: 0.2 },
} as never;

const fiat = formatFiat(tokenToFiat('1.5', 0.2), 'usd', 'en');

describe('Fees', () => {
  it('renders the fiat value before the TRX fee with its icon', () => {
    const serialized = JSON.stringify(
      Fees({ fees: [trxFee], preferences, tokenPrices }),
    );

    expect(serialized).toContain('"children":"1.5 TRX"');
    expect(serialized).toContain('"src":"https://icon.example/trx.png"');
    expect(serialized.indexOf(fiat)).toBeGreaterThan(-1);
    expect(serialized.indexOf(fiat)).toBeLessThan(
      serialized.indexOf('1.5 TRX'),
    );
  });

  it('renders a skeleton instead of the fiat value while prices load', () => {
    const serialized = JSON.stringify(
      Fees({
        fees: [trxFee],
        preferences,
        tokenPrices,
        tokenPricesFetchStatus: FetchStatus.Fetching,
      }),
    );

    expect(serialized).toContain('"type":"Skeleton"');
    expect(serialized).not.toContain(fiat);
  });

  it('renders only the fee when there is no price', () => {
    const serialized = JSON.stringify(Fees({ fees: [trxFee], preferences }));

    expect(serialized).toContain('"children":"1.5 TRX"');
    expect(serialized).not.toContain(fiat);
    expect(serialized).not.toContain('"type":"Skeleton"');
  });

  it('renders resource fees with their icons after the TRX fee', () => {
    const serialized = JSON.stringify(
      Fees({
        fees: [
          resourceFee('ENERGY', KnownCaip19Id.EnergyMainnet),
          resourceFee('BANDWIDTH', KnownCaip19Id.BandwidthNile),
          trxFee,
        ],
        preferences,
      }),
    );

    expect(serialized).toContain('"name":"flash"');
    expect(serialized).toContain('"name":"connect"');
    expect(serialized.indexOf('1.5 TRX')).toBeLessThan(
      serialized.indexOf('100 ENERGY'),
    );
    expect(serialized.indexOf('100 ENERGY')).toBeLessThan(
      serialized.indexOf('100 BANDWIDTH'),
    );
    expect(serialized.match(/"type":"Image"/gu)).toHaveLength(1);
  });
});
