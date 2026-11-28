import { BigNumber } from 'bignumber.js';
import { MPTokenAuthorizeFlags } from 'xrpl';

import { KnownCaip2ChainId } from '../../api';
import type { KnownCaip19IouAssetId, KnownCaip19Slip44Id } from '../../api';
import {
  getSlip44AssetId,
  toCaip19IouAssetId,
  toCaip19MptAssetId,
} from '../../utils';
import { OnChainAccount } from '../on-chain-account/OnChainAccount';
import { TransactionBuilderException } from './exceptions';
import { TransactionBuilder } from './TransactionBuilder';

const accountAddress = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const destination = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const scope = KnownCaip2ChainId.Mainnet;
const iouAssetId = toCaip19IouAssetId(scope, 'USD', issuer);
const mptIssuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const mptAssetId = toCaip19MptAssetId(scope, mptIssuanceId);

function source(): OnChainAccount {
  return new OnChainAccount({
    accountId: accountAddress,
    sequenceNumber: '7',
    scope,
  });
}

describe('TransactionBuilder', () => {
  const builder = new TransactionBuilder();

  it('builds a native payment from the account sequence', () => {
    const payment = builder.nativePayment({
      assetId: getSlip44AssetId(scope),
      onChainAccount: source(),
      amount: new BigNumber(1_000_000),
      destination,
    });

    expect(payment).toStrictEqual({
      TransactionType: 'Payment',
      Account: accountAddress,
      Destination: destination,
      Amount: '1000000',
      Sequence: 7,
    });
  });

  it('builds an IOU payment with 15 significant digits', () => {
    const payment = builder.iouPayment({
      assetId: iouAssetId,
      onChainAccount: source(),
      amount: new BigNumber('12.5'),
      destination,
    });

    expect(payment.Amount).toStrictEqual({
      currency: 'USD',
      issuer,
      value: '12.500000000000000',
    });
  });

  it('clears a trust line when the limit is omitted', () => {
    const trustSet = builder.changeTrust({
      assetId: iouAssetId,
      onChainAccount: source(),
    });

    expect(trustSet.LimitAmount).toStrictEqual({
      currency: 'USD',
      issuer,
      value: '0',
    });
  });

  it('builds an MPT authorize without unauthorize flags', () => {
    const authorize = builder.mptAuthorize({
      assetId: mptAssetId,
      onChainAccount: source(),
      authorize: true,
    });

    expect(authorize).toMatchObject({
      TransactionType: 'MPTokenAuthorize',
      Account: accountAddress,
      Sequence: 7,
      MPTokenIssuanceID: mptIssuanceId,
    });
    expect(authorize).not.toHaveProperty('Flags');
  });

  it('builds an MPT unauthorize with tfMPTUnauthorize', () => {
    const unauthorize = builder.mptAuthorize({
      assetId: mptAssetId,
      onChainAccount: source(),
      authorize: false,
    });

    expect(unauthorize.Flags).toStrictEqual(
      MPTokenAuthorizeFlags.tfMPTUnauthorize,
    );
  });

  it('wraps an asset that is not on mainnet', () => {
    expect(() =>
      builder.nativePayment({
        assetId: 'xrpl:1/slip44:144' as KnownCaip19Slip44Id,
        onChainAccount: source(),
        amount: new BigNumber(1),
        destination,
      }),
    ).toThrow(TransactionBuilderException);

    expect(() =>
      builder.changeTrust({
        assetId: 'not-an-asset' as KnownCaip19IouAssetId,
        onChainAccount: source(),
      }),
    ).toThrow(TransactionBuilderException);
  });
});
