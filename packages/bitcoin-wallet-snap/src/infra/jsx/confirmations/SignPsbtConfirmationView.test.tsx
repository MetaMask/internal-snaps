import type { Messages, SignPsbtConfirmationContext } from '../../../entities';
import { CurrencyUnit } from '../../../entities';
import { SignPsbtConfirmationView } from './SignPsbtConfirmationView';

const SAMPLE_PSBT =
  'cHNidP8BAI4CAAAAAAM1gwEAAAAAACJRIORP1Ndiq325lSC/jMG0RlhATHYmuuULfXgEHUM3u5i4AAAAAAAAAAAxai8AAUSx+i9Igg4HWdcpyagCs8mzuRCklgA7nRMkm69rAAAAAAAAAAAAAQACAAAAACp2AAAAAAAAFgAUgu3FEiFNy9ZR/zSpTo9nHREjrSoAAAAAAAAAAAA=';

const messages: Messages = {
  'confirmation.signPsbt.title': { message: 'Sign Transaction' },
  'confirmation.signPsbt.outputs': { message: 'Transaction outputs' },
  'confirmation.signPsbt.output.opReturn': { message: 'OP_RETURN (data)' },
  'confirmation.signPsbt.output.change': { message: 'Change' },
  'confirmation.signPsbt.output.unknown': { message: 'Unknown script' },
  'confirmation.signPsbt.options': { message: 'Options' },
  'confirmation.signPsbt.options.fill': { message: 'Auto-fill inputs' },
  'confirmation.signPsbt.options.broadcast': { message: 'Broadcast' },
  'confirmation.signPsbt.inputs': { message: 'Inputs' },
  'confirmation.signPsbt.rawPsbt': { message: 'Raw PSBT' },
  'confirmation.signPsbt.confirmButton': { message: 'Sign' },
  'confirmation.requestOrigin': { message: 'Request from' },
  toAddress: { message: 'To' },
  from: { message: 'From' },
  network: { message: 'Network' },
  networkFee: { message: 'Network fee' },
  cancel: { message: 'Cancel' },
  yes: { message: 'Yes' },
  no: { message: 'No' },
};

const contextWith = (
  overrides: Partial<SignPsbtConfirmationContext> = {},
): SignPsbtConfirmationContext => ({
  psbt: SAMPLE_PSBT,
  account: {
    id: 'account-id',
    address: 'bc1qaccountaddress',
  },
  network: 'bitcoin',
  origin: 'https://dapp.example',
  options: { fill: true, broadcast: false },
  currency: CurrencyUnit.Bitcoin,
  exchangeRate: { conversionRate: 100_000, conversionDate: 0, currency: 'USD' },
  fee: '1200',
  outputs: [],
  inputCount: 0,
  ...overrides,
});

const render = (context: SignPsbtConfirmationContext): string =>
  JSON.stringify(SignPsbtConfirmationView({ context, messages }));

describe('SignPsbtConfirmationView', () => {
  it('labels every kind of transaction output', () => {
    const serialized = render(
      contextWith({
        outputs: [
          { amount: '0', isMine: false, isOpReturn: true },
          {
            amount: '2100',
            address: 'bc1qchange',
            isMine: true,
            isOpReturn: false,
          },
          {
            amount: '1234',
            address: 'bc1qrecipient',
            isMine: false,
            isOpReturn: false,
          },
          { amount: '500', isMine: false, isOpReturn: false },
        ],
      }),
    );

    expect(serialized).toContain('OP_RETURN (data)');
    expect(serialized).toContain('Change');
    expect(serialized).toContain('To #3');
    expect(serialized).toContain('Unknown script');
    expect(serialized).toContain('0.00001234 BTC');
    expect(serialized).toContain(
      'bip122:000000000019d6689c085ae165831e93:bc1qrecipient',
    );
  });

  it('renders the selected options, the input count and the fee', () => {
    const serialized = render(contextWith({ inputCount: 2 }));

    expect(serialized).toContain('Auto-fill inputs');
    expect(serialized).toContain('Yes');
    expect(serialized).toContain('No');
    expect(serialized).toContain('Inputs');
    expect(serialized).toContain(
      'bip122:000000000019d6689c085ae165831e93:bc1qaccountaddress',
    );
    expect(serialized).toContain('0.000012 BTC');
  });

  it('omits the outputs, inputs and fee rows when there is nothing to show', () => {
    const serialized = render(contextWith({ fee: undefined, outputs: [] }));

    expect(serialized).not.toContain('Transaction outputs');
    expect(serialized).not.toContain('Inputs');
    expect(serialized).not.toContain('Network fee');
    expect(serialized).toContain('https://dapp.example');
    expect(serialized).toContain(SAMPLE_PSBT);
  });
});
