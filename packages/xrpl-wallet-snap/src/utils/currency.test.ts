import { BigNumber } from 'bignumber.js';

import type { KnownCaip19IouAssetId } from '../api/asset';
import { toLedgerSendAmount } from './currency';

const nativeId = 'xrpl:0/slip44:144';
const iouId =
  'xrpl:0/token:USD.rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY' as KnownCaip19IouAssetId;

describe('toLedgerSendAmount', () => {
  it('converts XRP display units to drops', () => {
    expect(
      toLedgerSendAmount(nativeId, new BigNumber('1.5'), 6).toFixed(0),
    ).toBe('1500000');
  });

  it('keeps an IOU amount in currency units', () => {
    const amount = toLedgerSendAmount(iouId, new BigNumber('1.5'), 6);

    expect(amount.toFixed()).toBe('1.5');
  });

  it('keeps a small IOU amount out of scientific notation', () => {
    const amount = toLedgerSendAmount(iouId, new BigNumber('0.00000001'), 15);

    expect(amount.toFixed()).toBe('0.00000001');
  });
});
