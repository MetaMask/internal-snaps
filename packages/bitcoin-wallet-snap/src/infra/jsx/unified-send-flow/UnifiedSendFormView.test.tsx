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

const messages: Messages = {
  'confirmation.requestOrigin': { message: 'Request from' },
};

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

/**
 * Wraps tests for UnifiedSendFormView by rendering it with fresh
 * bitcoindevkit mocks (restored per call, which `resetMocks` clears after
 * each test). The callback receives the text strings of the rendered tree.
 *
 * @param testFunction - The test body receiving the rendered texts.
 * @param options - Rendering options.
 * @param options.origin - The request origin, as received by the snap.
 * @returns The return value of the callback.
 */
async function withUnifiedSendFormView<ReturnValue>(
  testFunction: ({
    texts,
  }: {
    /** All text strings of the rendered view. */
    texts: string[];
  }) => ReturnValue | Promise<ReturnValue>,
  { origin }: { origin?: string } = {},
): Promise<ReturnValue> {
  jest
    .mocked(Amount.from_sat)
    .mockImplementation(
      (): Amount => ({ to_btc: (): string => '0.00001' }) as unknown as Amount,
    );
  jest.mocked(Psbt.from_string).mockImplementation(
    (): Psbt =>
      ({
        fee: (): { to_sat: () => bigint } => ({
          to_sat: (): bigint => 1000n,
        }),
      }) as unknown as Psbt,
  );

  const view = UnifiedSendFormView({
    context: buildContext(origin),
    messages,
  });

  return testFunction({ texts: collectTexts(view) });
}

describe('UnifiedSendFormView', () => {
  it('renders the origin row with the hostname of a verifiable origin', async () => {
    await withUnifiedSendFormView(
      ({ texts }) => {
        expect(texts).toContain('Request from');
        expect(texts).toContain('app.uniswap.org');
      },
      { origin: 'https://app.uniswap.org' },
    );
  });

  it('hides the origin row for a WalletConnect channel id', async () => {
    await withUnifiedSendFormView(
      ({ texts }) => {
        expect(texts).not.toContain('Request from');
      },
      { origin: '4f3a1b2c-0000-4000-8000-000000000000' },
    );
  });

  it('labels the MetaMask origin when none is provided', async () => {
    await withUnifiedSendFormView(({ texts }) => {
      expect(texts).toContain('Request from');
      expect(texts).toContain('MetaMask');
    });
  });
});
