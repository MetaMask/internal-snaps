import { TransactionType } from '@metamask/keyring-api';
import { Types as TronwebTypes } from 'tronweb';

import { mapRawTransactionType } from './transactionType';

/**
 * Builds raw transaction data carrying a single contract of the given type.
 *
 * @param type - The Tron contract type.
 * @returns Raw transaction data.
 */
function buildRawData(
  type: TronwebTypes.ContractType,
): TronwebTypes.Transaction['raw_data'] {
  return {
    contract: [
      {
        parameter: {
          value: {},
          type_url: 'type.googleapis.com/protocol.Transaction.Contract',
        },
        type,
      },
    ],
    ref_block_bytes: '',
    ref_block_hash: '',
    expiration: 0,
    timestamp: 0,
  } as TronwebTypes.Transaction['raw_data'];
}

describe('mapRawTransactionType', () => {
  it.each([
    [TronwebTypes.ContractType.TransferContract, TransactionType.Send],
    [TronwebTypes.ContractType.TransferAssetContract, TransactionType.Send],
    [
      TronwebTypes.ContractType.FreezeBalanceContract,
      TransactionType.StakeDeposit,
    ],
    [
      TronwebTypes.ContractType.FreezeBalanceV2Contract,
      TransactionType.StakeDeposit,
    ],
    [
      TronwebTypes.ContractType.UnfreezeBalanceContract,
      TransactionType.StakeWithdraw,
    ],
    [
      TronwebTypes.ContractType.UnfreezeBalanceV2Contract,
      TransactionType.StakeWithdraw,
    ],
    [
      TronwebTypes.ContractType.WithdrawExpireUnfreezeContract,
      TransactionType.StakeWithdraw,
    ],
    [TronwebTypes.ContractType.TriggerSmartContract, TransactionType.Unknown],
    [TronwebTypes.ContractType.VoteWitnessContract, TransactionType.Unknown],
  ])('maps %s to %s', (contractType, expected) => {
    expect(mapRawTransactionType(buildRawData(contractType))).toBe(expected);
  });

  it('falls back to unknown when the raw data is missing', () => {
    expect(mapRawTransactionType(undefined)).toBe(TransactionType.Unknown);
  });

  it('falls back to unknown when there is no contract', () => {
    expect(
      mapRawTransactionType({
        contract: [],
      } as unknown as TronwebTypes.Transaction['raw_data']),
    ).toBe(TransactionType.Unknown);
  });
});
