import { TxJsonStruct, XrplTransactionType } from './api';

const account = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

describe('TxJsonStruct', () => {
  it('accepts an MPT opt-in', () => {
    expect(
      TxJsonStruct.is({
        TransactionType: XrplTransactionType.MPTokenAuthorize,
        Account: account,
        MPTokenIssuanceID: '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3',
      }),
    ).toBe(true);
  });

  it('rejects an unknown transaction type', () => {
    expect(
      TxJsonStruct.is({
        TransactionType: 'MPTokenMint',
        Account: account,
      }),
    ).toBe(false);
  });
});
