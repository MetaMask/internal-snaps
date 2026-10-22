import { ActionHeader } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';

import { Network } from '../../../constants';
import { FetchStatus } from '../../../types/snap';
import { ConfirmSignMessage } from './ConfirmSignMessage/ConfirmSignMessage';
import { ConfirmSignTransaction } from './ConfirmSignTransaction/ConfirmSignTransaction';
import { ConfirmTransactionRequest } from './ConfirmTransactionRequest/ConfirmTransactionRequest';

const address = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';
const account = { address };

const props = {
  message: 'Hello',
  account,
  scope: Network.Mainnet,
  locale: 'en',
  networkImage: '',
  origin: 'https://example.com',
  context: {
    scope: Network.Mainnet,
    account,
    origin: 'https://example.com',
    fromAddress: address,
    toAddress: address,
    amount: '1',
    asset: {
      assetType: `${Network.Mainnet}/slip44:195`,
      network: Network.Mainnet,
      symbol: 'TRX',
      decimals: 6,
      iconUrl: '',
    },
    transaction: { rawDataHex: '0a02beef', type: 'TransferContract' },
    transactionRawData: null,
    accountType: 'tron:eoa',
    preferences: {
      locale: 'en',
      currency: 'usd',
      useSecurityAlerts: false,
      simulateOnChainActions: false,
    },
    networkImage: '',
    scan: null,
    scanFetchStatus: FetchStatus.Fetched,
    tokenPrices: {},
    tokenPricesFetchStatus: FetchStatus.Fetched,
    fees: [],
    feesFetchStatus: FetchStatus.Fetched,
    isInsufficientBalance: false,
  },
} as never;

describe.each<[string, (viewProps: never) => ComponentOrElement, string]>([
  ['ConfirmSignMessage', ConfirmSignMessage, 'Sign message'],
  ['ConfirmSignTransaction', ConfirmSignTransaction, 'Sign transaction'],
  [
    'ConfirmTransactionRequest',
    ConfirmTransactionRequest,
    'Transaction request',
  ],
])('%s', (_name, View, title) => {
  it('renders the shared header', () => {
    expect(JSON.stringify(View(props))).toContain(
      JSON.stringify(ActionHeader({ title })),
    );
  });
});
