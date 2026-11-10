import type { ComponentOrElement } from '@metamask/snaps-sdk';

import { KnownCaip2ChainId } from '../../../../api';
import { defaultPreferences as preferences } from '../../__fixtures__/confirmation.fixtures';
import { MemoEditFormNames } from '../MemoEdit/constants';
import { ConfirmSendTransaction } from './ConfirmSendTransaction';

type Props = Parameters<typeof ConfirmSendTransaction>[0];

const props = {
  account: {
    address: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  toAddress: 'GDTF7ERUQVTX23ZD6NY5XRYC5IQAKWFVTQ6IXSMEZWGVNDDGPYCVHRZP',
  scope: KnownCaip2ChainId.Mainnet,
  locale: 'en',
  networkImage: null,
  feeData: {
    assetId: 'stellar:pubnet/slip44:148',
    symbol: 'XLM',
    iconUrl: '',
    amount: '0.00001',
  },
  tokenPrices: {},
  tokenPricesFetchStatus: 'fetched',
  currency: 'usd',
  origin: null,
  preferences,
  scan: null,
} as unknown as Props;

type Element = {
  type?: string;
  props?: Record<string, unknown>;
};

/**
 * Finds the first button element in the tree with the given name.
 *
 * @param node - The element to search.
 * @param name - The button name to match.
 * @returns The matching button props, or undefined.
 */
function findButton(
  node: ComponentOrElement | null,
  name: string,
): Record<string, unknown> | undefined {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }
  const element = node as Element;
  if (element.type === 'Button' && element.props?.name === name) {
    return element.props;
  }
  const children = element.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findButton(child as ComponentOrElement | null, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

describe('ConfirmSendTransaction', () => {
  it('shows the client memo without an Add/Update control', () => {
    const view = ConfirmSendTransaction({
      ...props,
      memo: 'provider-ref',
      memoEditable: false,
    });

    expect(JSON.stringify(view)).toContain('"children":"provider-ref"');
    expect(findButton(view, MemoEditFormNames.Open)).toBeUndefined();
  });

  it('offers the memo Add/Update control when the memo is editable', () => {
    const editable = ConfirmSendTransaction({ ...props, memo: 'draft-ref' });
    expect(findButton(editable, MemoEditFormNames.Open)?.children).toBe(
      'Update',
    );

    const empty = ConfirmSendTransaction({ ...props });
    expect(findButton(empty, MemoEditFormNames.Open)?.children).toBe('Add');
  });
});
