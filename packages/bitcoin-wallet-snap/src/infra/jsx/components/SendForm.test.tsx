import type { Messages, SendFormContext } from '../../../entities';
import { CurrencyUnit } from '../../../entities';
import { SendForm } from './SendForm';

const messages: Messages = {
  from: { message: 'From' },
  toAddress: { message: 'To' },
  recipientPlaceholder: { message: 'Enter receiving address' },
  asset: { message: 'Asset' },
  amount: { message: 'Amount' },
  balance: { message: 'Balance' },
  max: { message: 'Max' },
  clear: { message: 'Clear' },
  feeTooLow: { message: 'Fee too low' },
};

const contextWith = (
  overrides: Partial<SendFormContext> = {},
): SendFormContext => ({
  account: {
    id: 'account-id',
    address: 'bc1qaccountaddress',
  },
  network: 'bitcoin',
  balance: '100000',
  feeRate: 3,
  currency: CurrencyUnit.Bitcoin,
  errors: {},
  locale: 'en',
  ...overrides,
});

const render = (props: SendFormContext): string =>
  JSON.stringify(SendForm({ ...props, messages }));

describe('SendForm', () => {
  it('renders the account, recipient and amount fields for a valid recipient', () => {
    const serialized = render(
      contextWith({ amount: '1234', recipient: 'bc1qrecipient' }),
    );

    expect(serialized).toContain(
      'bip122:000000000019d6689c085ae165831e93:bc1qaccountaddress',
    );
    expect(serialized).toContain('bc1qrecipient');
    expect(serialized).toContain('0.00001234');
    expect(serialized).toContain('Balance: 0.001 BTC');
    expect(serialized).toContain('"name":"max"');
    expect(serialized).not.toContain('Fee too low');
  });

  it('hides the amount fields and shows the recipient error for an invalid recipient', () => {
    const serialized = render(
      contextWith({
        errors: {
          recipient: {
            name: 'ValidationError',
            message: 'invalid address',
            code: 7,
            stack: null,
          },
        },
        recipient: 'not-an-address',
      }),
    );

    expect(serialized).not.toContain('"name":"amount"');
    expect(serialized).toContain('Fee too low');
    expect(serialized).toContain('"name":"clearRecipient"');
  });

  it('renders an empty amount input before the user types an amount', () => {
    const serialized = render(contextWith({ recipient: 'bc1qrecipient' }));

    expect(serialized).toContain('"name":"amount","type":"number"');
    expect(serialized).toContain('"value":""');
  });

  it('renders the fiat amount and the clear button when draining', () => {
    const serialized = render(
      contextWith({
        amount: '5000',
        currency: CurrencyUnit.Fiat,
        drain: true,
        exchangeRate: {
          conversionRate: 100_000,
          conversionDate: 0,
          currency: 'USD',
        },
        recipient: 'bc1qrecipient',
      }),
    );

    expect(serialized).toContain('"value":"5.00"');
    expect(serialized).toContain('Balance: 100.00 USD');
    expect(serialized).toContain('"name":"clearAmount"');
    expect(serialized).toContain('"step":0.01');
  });
});
