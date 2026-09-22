/* eslint-disable @typescript-eslint/naming-convention -- BDK uses snake_case */
import { Amount, Psbt } from '@metamask/bitcoindevkit';

import type { ConfirmSendFormContext, Messages } from '../../../entities';
import { UnifiedSendFormView } from './UnifiedSendFormView';

jest.mock('@metamask/bitcoindevkit', () => ({
  Amount: {
    from_sat: jest.fn(),
  },
  BdkErrorCode: {},
  Psbt: {
    from_string: jest.fn(),
  },
}));

/**
 * Collects every text string of a JSX element tree, so tests can assert on
 * which rows a confirmation view renders.
 *
 * @param node - A JSX element, an array of them, or a text string.
 * @returns All text strings found in the tree.
 */
const collectTexts = (node: unknown): string[] => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return [];
  }
  if (typeof node === 'string') {
    return [node];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child: unknown): string[] => collectTexts(child));
  }
  if (typeof node === 'object') {
    return collectTexts(
      (node as { props?: { children?: unknown } }).props?.children,
    );
  }
  return [];
};

describe('UnifiedSendFormView', () => {
  const messages: Messages = {
    'confirmation.requestOrigin': { message: 'Request from' },
  };

  const mockAmount = { to_btc: (): string => '0.00001' } as unknown as Amount;
  const mockPsbt = {
    fee: (): { to_sat: () => bigint } => ({
      to_sat: (): bigint => 1000n,
    }),
  } as unknown as Psbt;

  // `resetMocks` clears the module-factory implementations, so they are
  // restored before each test.
  beforeEach(() => {
    jest.mocked(Amount.from_sat).mockImplementation((): Amount => mockAmount);
    jest.mocked(Psbt.from_string).mockImplementation((): Psbt => mockPsbt);
  });

  const buildContext = (origin?: string): ConfirmSendFormContext => ({
    from: 'bc1qfrom',
    explorerUrl: 'https://mempool.space',
    network: 'bitcoin',
    currency: 'BTC',
    recipient: 'bc1qto',
    amount: '1000',
    locale: 'en',
    psbt: 'cHNidP8B',
    isMine: false,
    origin,
  });

  it('renders the origin row with the hostname of a verifiable origin', () => {
    const view = UnifiedSendFormView({
      context: buildContext('https://app.uniswap.org'),
      messages,
    });

    const texts = collectTexts(view);
    expect(texts).toContain('Request from');
    expect(texts).toContain('app.uniswap.org');
  });

  it('hides the origin row for a WalletConnect channel id', () => {
    const view = UnifiedSendFormView({
      context: buildContext('4f3a1b2c-0000-4000-8000-000000000000'),
      messages,
    });

    expect(collectTexts(view)).not.toContain('Request from');
  });

  it('labels the MetaMask origin when none is provided', () => {
    const view = UnifiedSendFormView({
      context: buildContext(undefined),
      messages,
    });

    const texts = collectTexts(view);
    expect(texts).toContain('Request from');
    expect(texts).toContain('MetaMask');
  });
});
