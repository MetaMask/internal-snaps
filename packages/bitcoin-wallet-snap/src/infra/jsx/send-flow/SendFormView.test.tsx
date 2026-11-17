import type { Messages, SendFormContext } from '../../../entities';
import { CurrencyUnit } from '../../../entities';
import { SendFormView } from './SendFormView';

const messages: Messages = {
  send: { message: 'Send' },
  error: { message: 'Error' },
  feeTooLow: { message: 'Fee too low' },
  continue: { message: 'Continue' },
  from: { message: 'From' },
  toAddress: { message: 'To' },
  recipientPlaceholder: { message: 'Enter receiving address' },
  asset: { message: 'Asset' },
  amount: { message: 'Amount' },
  balance: { message: 'Balance' },
  max: { message: 'Max' },
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

const render = (context: SendFormContext): string =>
  JSON.stringify(SendFormView({ context, messages }));

describe('SendFormView', () => {
  it('renders the form with an enabled continue button', () => {
    const serialized = render(contextWith({ fee: '1500' }));

    expect(serialized).toContain('Send');
    expect(serialized).toContain('Continue');
    expect(serialized).not.toContain('"disabled":true');
    expect(serialized).not.toContain('Fee too low');
  });

  it('renders the transaction error banner and disables continue without a fee', () => {
    const serialized = render(
      contextWith({
        errors: {
          tx: {
            name: 'WalletError',
            message: 'fee too low',
            code: 7,
            stack: null,
          },
        },
      }),
    );

    expect(serialized).toContain('Error');
    expect(serialized).toContain('Fee too low');
    expect(serialized).toContain('"disabled":true');
  });
});
