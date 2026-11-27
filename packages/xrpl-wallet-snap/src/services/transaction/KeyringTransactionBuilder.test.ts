import { TransactionStatus, TransactionType } from '@metamask/keyring-api';
import { BigNumber } from 'bignumber.js';

import { KnownCaip2ChainId } from '../../api';
import { getSlip44AssetId } from '../../utils';
import type { XrplKeyringAccount } from '../account/api';
import {
  KeyringTransactionBuilder,
  KeyringTransactionType,
} from './KeyringTransactionBuilder';

const scope = KnownCaip2ChainId.Mainnet;
const account = {
  id: 'account-1',
  address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
} as XrplKeyringAccount;
const asset = {
  unit: 'XRP',
  type: getSlip44AssetId(scope),
  amount: '1',
  fungible: true as const,
};

describe('KeyringTransactionBuilder', () => {
  const builder = new KeyringTransactionBuilder();

  it('builds a send transaction', () => {
    const transaction = builder.createTransaction({
      type: KeyringTransactionType.Send,
      request: {
        txId: 'tx-1',
        account,
        scope,
        toAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        asset,
        timestamp: 100,
      },
    });

    expect(transaction).toMatchObject({
      id: 'tx-1',
      type: TransactionType.Send,
      account: 'account-1',
      chain: scope,
      status: TransactionStatus.Unconfirmed,
      timestamp: 100,
    });
    expect(transaction.to?.[0]?.address).toStrictEqual(
      'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    );
  });

  it('labels a trustline opt-in', () => {
    const transaction = builder.createTransaction({
      type: KeyringTransactionType.ChangeTrustOptIn,
      request: {
        txId: 'tx-2',
        account,
        scope,
        asset,
        timestamp: 100,
      },
    });

    expect(transaction.type).toStrictEqual(TransactionType.TokenApprove);
    expect(transaction.details).toStrictEqual({
      typeLabel: 'trustline-approve',
    });
  });

  it('formats the base fee in XRP', () => {
    expect(builder.getBaseFees(new BigNumber(120_000), scope)).toStrictEqual([
      {
        type: 'base',
        asset: {
          unit: 'XRP',
          type: getSlip44AssetId(scope),
          amount: '0.12',
          fungible: true,
        },
      },
    ]);
  });
});
