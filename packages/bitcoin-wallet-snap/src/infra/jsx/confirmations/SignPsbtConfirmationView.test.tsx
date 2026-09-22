import type { Messages, SignPsbtConfirmationContext } from '../../../entities';
import { SignPsbtConfirmationView } from './SignPsbtConfirmationView';

jest.mock('@metamask/bitcoindevkit', () => ({
  Amount: {
    from_sat: jest.fn(),
  },
  BdkErrorCode: {},
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

describe('SignPsbtConfirmationView', () => {
  const messages: Messages = {
    'confirmation.requestOrigin': { message: 'Request from' },
  };

  const buildContext = (origin: string): SignPsbtConfirmationContext => ({
    psbt: 'cHNidP8B',
    account: { id: 'account-id', address: 'bc1qtest' },
    network: 'bitcoin',
    origin,
    options: { fill: false, broadcast: false },
    currency: 'BTC',
    outputs: [],
    inputCount: 1,
  });

  it('renders the origin row with the hostname of a verifiable origin', () => {
    const view = SignPsbtConfirmationView({
      context: buildContext('https://app.uniswap.org'),
      messages,
    });

    const texts = collectTexts(view);
    expect(texts).toContain('Request from');
    expect(texts).toContain('app.uniswap.org');
  });

  it('hides the origin row for a WalletConnect channel id', () => {
    const view = SignPsbtConfirmationView({
      context: buildContext('4f3a1b2c-0000-4000-8000-000000000000'),
      messages,
    });

    expect(collectTexts(view)).not.toContain('Request from');
  });

  it('labels the MetaMask origin', () => {
    const view = SignPsbtConfirmationView({
      context: buildContext('metamask'),
      messages,
    });

    const texts = collectTexts(view);
    expect(texts).toContain('Request from');
    expect(texts).toContain('MetaMask');
  });
});
