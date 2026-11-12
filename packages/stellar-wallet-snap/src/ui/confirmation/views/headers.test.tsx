import { ActionHeader } from '@metamask/snap-networks-utils';
import type { ActionHeaderProps } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';

import { KnownCaip2ChainId } from '../../../api';
import {
  defaultPreferences as preferences,
  maliciousScan,
} from '../__fixtures__/confirmation.fixtures';
import { FetchStatus } from '../api';
import { AccountActivationPrompt } from './AccountActivationPrompt/AccountActivationPrompt';
import { ConfirmSendTransaction } from './ConfirmSendTransaction/ConfirmSendTransaction';
import { ConfirmSignAuthEntry } from './ConfirmSignAuthEntry/ConfirmSignAuthEntry';
import { ConfirmSignChangeTrustOptIn } from './ConfirmSignChangeTrustOptIn/ConfirmSignChangeTrustOptIn';
import { ConfirmSignChangeTrustOptOut } from './ConfirmSignChangeTrustOptOut/ConfirmSignChangeTrustOptOut';
import { ConfirmSignMessage } from './ConfirmSignMessage/ConfirmSignMessage';
import { ConfirmSignTransaction } from './ConfirmSignTransaction/ConfirmSignTransaction';
import { MaliciousAcknowledgementScreen } from './MaliciousAcknowledgement/MaliciousAcknowledgementScreen';
import { MemoEditScreen } from './MemoEdit/MemoEditScreen';

const address = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

const props = {
  account: { address },
  accountAddress: address,
  toAddress: address,
  scope: KnownCaip2ChainId.Mainnet,
  locale: 'en',
  networkImage: null,
  origin: null,
  preferences,
  scan: null,
  tokenPrices: {},
  message: 'Hello',
  assetMetadata: {
    assetId: `stellar:pubnet/asset:USDC-${address}`,
    symbol: 'USDC',
    iconUrl: 'https://icon.example/usdc.png',
  },
  feeData: {
    assetId: 'stellar:pubnet/slip44:148',
    symbol: 'XLM',
    iconUrl: '',
    amount: '0.00001',
  },
  readableAuthEntry: {
    authorizations: [],
    signatureExpirationLedger: 1,
    nonce: '1',
  },
  readableTransaction: {
    scope: KnownCaip2ChainId.Mainnet,
    feeStroops: '100',
    operationCount: 0,
    sourceAccount: address,
    feeSourceAccount: address,
    memo: null,
    operations: [],
    authorizations: [],
  },
} as never;

describe.each<
  [string, (viewProps: never) => ComponentOrElement, ActionHeaderProps]
>([
  [
    'AccountActivationPrompt',
    AccountActivationPrompt,
    { title: 'Activate Stellar Wallet' },
  ],
  [
    'ConfirmSendTransaction',
    ConfirmSendTransaction,
    { title: 'Transaction request' },
  ],
  [
    'ConfirmSignAuthEntry',
    ConfirmSignAuthEntry,
    { title: 'Authorize smart contract' },
  ],
  [
    'ConfirmSignChangeTrustOptIn',
    ConfirmSignChangeTrustOptIn,
    { title: 'Add USDC trustline', iconUrl: 'https://icon.example/usdc.png' },
  ],
  [
    'ConfirmSignChangeTrustOptOut',
    ConfirmSignChangeTrustOptOut,
    {
      title: 'Remove USDC trustline',
      iconUrl: 'https://icon.example/usdc.png',
    },
  ],
  ['ConfirmSignMessage', ConfirmSignMessage, { title: 'Sign message' }],
  [
    'ConfirmSignTransaction',
    ConfirmSignTransaction,
    { title: 'Sign transaction' },
  ],
  [
    'MaliciousAcknowledgementScreen',
    MaliciousAcknowledgementScreen,
    { title: 'High-risk request' },
  ],
  ['MemoEditScreen', MemoEditScreen, { title: 'Transaction memo' }],
])('%s', (_name, View, header) => {
  it('renders the shared header', () => {
    expect(JSON.stringify(View(props))).toContain(
      JSON.stringify(ActionHeader(header)),
    );
  });
});

describe.each([
  ['send', ConfirmSendTransaction],
  ['sign', ConfirmSignTransaction],
  ['change trust opt in', ConfirmSignChangeTrustOptIn],
  ['change trust opt out', ConfirmSignChangeTrustOptOut],
] as [string, (viewProps: never) => ComponentOrElement][])(
  '%s confirmation footer',
  (_name, View) => {
    it('routes malicious confirmations through a destructive Confirm button', () => {
      const view = View({
        ...(props as object),
        scan: maliciousScan,
        scanFetchStatus: FetchStatus.Fetched,
        transactionsFetchStatus: FetchStatus.Fetched,
      } as never);
      const serialized = JSON.stringify(view);
      expect(serialized).toContain('malicious-acknowledgement-review');
      expect(serialized).toContain('"variant":"destructive"');
      expect(serialized).toContain('"children":"Confirm"');
    });

    it('keeps confirmation disabled when the scan is loading', () => {
      const view = View({
        ...(props as object),
        scan: maliciousScan,
        scanFetchStatus: FetchStatus.Fetching,
        transactionsFetchStatus: FetchStatus.Fetched,
      } as never);
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain('malicious-acknowledgement-review');
      expect(serialized).toContain('"disabled":true');
    });
  },
);
