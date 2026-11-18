import type { Amount, FeeRate, Psbt } from '@metamask/bitcoindevkit';
import { Psbt as BdkPsbt } from '@metamask/bitcoindevkit';
import { mock } from 'vitest-mock-extended';

import type { Messages, ReviewTransactionContext } from '../../../entities';
import { CurrencyUnit } from '../../../entities';
import { ReviewTransactionView } from './ReviewTransactionView';

const SAMPLE_PSBT =
  'cHNidP8BAI4CAAAAAAM1gwEAAAAAACJRIORP1Ndiq325lSC/jMG0RlhATHYmuuULfXgEHUM3u5i4AAAAAAAAAAAxai8AAUSx+i9Igg4HWdcpyagCs8mzuRCklgA7nRMkm69rAAAAAAAAAAAAAQACAAAAACp2AAAAAAAAFgAUgu3FEiFNy9ZR/zSpTo9nHREjrSoAAAAAAAAAAAA=';

const messages: Messages = {
  review: { message: 'Review' },
  from: { message: 'From' },
  recipient: { message: 'Recipient' },
  transactionSpeed: { message: 'Transaction speed' },
  transactionSpeedTooltip: { message: 'The estimated time' },
  minutes: { message: 'min' },
  networkFee: { message: 'Network fee' },
  networkFeeTooltip: { message: 'The total network fee' },
  feeRate: { message: 'Fee rate' },
  total: { message: 'Total' },
  send: { message: 'Send' },
};

const mockAmount = (satoshis: bigint): Amount => {
  const amount = mock<Amount>();
  amount.to_sat.mockReturnValue(satoshis);
  return amount;
};

const createMockPsbtWithFee = (): Psbt => {
  const feeRate = mock<FeeRate>();
  feeRate.to_sat_per_vb_floor.mockReturnValue(3n);

  const psbt = mock<Psbt>();
  psbt.fee.mockReturnValue(mockAmount(1500n));
  psbt.fee_rate.mockReturnValue(feeRate);
  return psbt;
};

const contextWith = (
  overrides: Partial<ReviewTransactionContext> = {},
): ReviewTransactionContext => ({
  from: 'bc1qfromaddress',
  explorerUrl: 'https://mempool.space',
  network: 'bitcoin',
  currency: CurrencyUnit.Bitcoin,
  exchangeRate: { conversionRate: 100_000, conversionDate: 0, currency: 'USD' },
  recipient: 'bc1qrecipientaddress',
  amount: '10000',
  locale: 'en',
  psbt: SAMPLE_PSBT,
  ...overrides,
});

const render = (context: ReviewTransactionContext): string =>
  JSON.stringify(ReviewTransactionView({ context, messages }));

describe('ReviewTransactionView', () => {
  beforeEach(() => {
    vi.spyOn(BdkPsbt, 'from_string').mockReturnValue(createMockPsbtWithFee());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the amounts, fees and linked addresses', () => {
    const serialized = render(contextWith());

    expect(serialized).toContain('0.0001 BTC');
    expect(serialized).toContain('10.00 USD');
    expect(serialized).toContain('1500 sats');
    expect(serialized).toContain('3 sat/vB');
    expect(serialized).toContain('0.000115 BTC');
    expect(serialized).toContain('10 min');
    expect(serialized).toContain(
      'https://mempool.space/address/bc1qrecipientaddress',
    );
    expect(serialized).toContain(
      'https://mempool.space/address/bc1qfromaddress',
    );
  });

  it('renders plain addresses when the explorer URL is not a Snap link', () => {
    const serialized = render(contextWith({ explorerUrl: 'not a url' }));

    expect(serialized).not.toContain('https://mempool.space/address/');
    expect(serialized).toContain(
      'bip122:000000000019d6689c085ae165831e93:bc1qrecipientaddress',
    );
  });
});
