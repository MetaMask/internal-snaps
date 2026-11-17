import type { Psbt } from '@metamask/bitcoindevkit';
import { Psbt as BdkPsbt } from '@metamask/bitcoindevkit';

import type { ConfirmSendFormContext, Messages } from '../../../entities';
import { CurrencyUnit } from '../../../entities';
import { UnifiedSendFormView } from './UnifiedSendFormView';

const SAMPLE_PSBT =
  'cHNidP8BAI4CAAAAAAM1gwEAAAAAACJRIORP1Ndiq325lSC/jMG0RlhATHYmuuULfXgEHUM3u5i4AAAAAAAAAAAxai8AAUSx+i9Igg4HWdcpyagCs8mzuRCklgA7nRMkm69rAAAAAAAAAAAAAQACAAAAACp2AAAAAAAAFgAUgu3FEiFNy9ZR/zSpTo9nHREjrSoAAAAAAAAAAAA=';

const messages: Messages = {
  'confirmation.signAndSendTransaction.title': {
    message: 'Transaction request',
  },
  'confirmation.signAndSendTransaction.selfSend.title': {
    message: 'Sending to your own address',
  },
  'confirmation.signAndSendTransaction.selfSend.description': {
    message: 'The recipient belongs to this wallet',
  },
  'confirmation.estimatedChanges': { message: 'Estimated changes' },
  'confirmation.estimatedChanges.send': { message: 'You send' },
  'confirmation.requestOrigin': { message: 'Request from' },
  'confirmation.confirmButton': { message: 'Confirm' },
  from: { message: 'From' },
  toAddress: { message: 'To' },
  network: { message: 'Network' },
  networkFee: { message: 'Network fee' },
  cancel: { message: 'Cancel' },
};

const mockPsbt = {
  fee: (): { to_sat: () => bigint } => ({ to_sat: (): bigint => 1500n }),
} as unknown as Psbt;

const contextWith = (
  overrides: Partial<ConfirmSendFormContext> = {},
): ConfirmSendFormContext => ({
  from: 'bc1qfromaddress',
  explorerUrl: 'https://mempool.space',
  network: 'bitcoin',
  currency: CurrencyUnit.Bitcoin,
  exchangeRate: { conversionRate: 100_000, conversionDate: 0, currency: 'USD' },
  recipient: 'bc1qrecipientaddress',
  amount: '10000',
  locale: 'en',
  psbt: SAMPLE_PSBT,
  isMine: false,
  ...overrides,
});

const render = (context: ConfirmSendFormContext): string =>
  JSON.stringify(UnifiedSendFormView({ context, messages }));

describe('UnifiedSendFormView', () => {
  beforeEach(() => {
    vi.spyOn(BdkPsbt, 'from_string').mockReturnValue(mockPsbt);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the estimated changes, addresses, network and fee', () => {
    const serialized = render(contextWith({ origin: 'https://dapp.example' }));

    expect(serialized).toContain('Transaction request');
    expect(serialized).toContain('["-","0.0001"]');
    expect(serialized).toContain('10.00 USD');
    expect(serialized).toContain('https://dapp.example');
    expect(serialized).toContain('Bitcoin');
    expect(serialized).toContain('0.000015 BTC');
    expect(serialized).toContain(
      'https://mempool.space/address/bc1qrecipientaddress',
    );
    expect(serialized).not.toContain('Sending to your own address');
  });

  it('renders the self-send banner and falls back to the MetaMask origin', () => {
    const serialized = render(
      contextWith({
        explorerUrl: 'not a url',
        isMine: true,
        origin: undefined as unknown as string,
      }),
    );

    expect(serialized).toContain('Sending to your own address');
    expect(serialized).toContain('MetaMask');
    expect(serialized).not.toContain('https://mempool.space/address/');
    expect(serialized).toContain(
      'bip122:000000000019d6689c085ae165831e93:bc1qrecipientaddress',
    );
  });
});
