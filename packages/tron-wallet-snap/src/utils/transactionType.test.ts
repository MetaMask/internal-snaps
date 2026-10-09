import { TransactionType } from '@metamask/keyring-api';
import { Types as TronwebTypes } from 'tronweb';

import {
  mapRawTransactionType,
  resolveTransactionType,
} from './transactionType';

/**
 * Builds raw transaction data carrying a single contract of the given type.
 *
 * @param type - The Tron contract type.
 * @param value - The contract parameter value.
 * @returns Raw transaction data.
 */
function buildRawData(
  type: TronwebTypes.ContractType,
  value: Record<string, unknown> = {},
): TronwebTypes.Transaction['raw_data'] {
  return {
    contract: [
      {
        parameter: {
          value,
          type_url: 'type.googleapis.com/protocol.Transaction.Contract',
        },
        type,
      },
    ],
    ref_block_bytes: '',
    ref_block_hash: '',
    expiration: 0,
    timestamp: 0,
  } as unknown as TronwebTypes.Transaction['raw_data'];
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

describe('resolveTransactionType', () => {
  const TRON_MAINNET_TRX = 'tron:728126428/slip44:195';
  const TRON_MAINNET_USDT =
    'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const EVM_USDC = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  describe('with swap/bridge asset ids', () => {
    it('returns bridgeSend when the assets are on different chains', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(TronwebTypes.ContractType.TriggerSmartContract),
          sourceAssetId: TRON_MAINNET_USDT,
          destAssetId: EVM_USDC,
        }),
      ).toBe(TransactionType.BridgeSend);
    });

    it('returns swap when both assets are on the same chain', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(TronwebTypes.ContractType.TriggerSmartContract),
          sourceAssetId: TRON_MAINNET_TRX,
          destAssetId: TRON_MAINNET_USDT,
        }),
      ).toBe(TransactionType.Swap);
    });

    it('returns swap for the same chain even when the contract is a plain transfer', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(TronwebTypes.ContractType.TransferContract),
          sourceAssetId: TRON_MAINNET_TRX,
          destAssetId: TRON_MAINNET_USDT,
        }),
      ).toBe(TransactionType.Swap);
    });

    it('ignores a single asset id and falls back to the contract type', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(TronwebTypes.ContractType.TransferContract),
          sourceAssetId: TRON_MAINNET_TRX,
        }),
      ).toBe(TransactionType.Send);
    });

    it('does not treat an unparseable asset pair as a bridge', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(TronwebTypes.ContractType.TransferContract),
          sourceAssetId: 'not-an-asset-id' as never,
          destAssetId: EVM_USDC,
        }),
      ).toBe(TransactionType.Send);
    });
  });

  describe('without swap/bridge asset ids', () => {
    it('classifies a TRC20 transfer call as send', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(
            TronwebTypes.ContractType.TriggerSmartContract,
            {
              data: 'a9059cbb000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c0000000000000000000000000000000000000000000000000000000000000000',
            },
          ),
        }),
      ).toBe(TransactionType.Send);
    });

    it('classifies a TRC20 approve call as tokenApprove', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(
            TronwebTypes.ContractType.TriggerSmartContract,
            {
              data: '095ea7b3000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c0000000000000000000000000000000000000000000000000000000000000000',
            },
          ),
        }),
      ).toBe(TransactionType.TokenApprove);
    });

    it('classifies an unknown smart-contract call as unknown', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(
            TronwebTypes.ContractType.TriggerSmartContract,
            {
              data: 'deadbeef00000000000000000000000000000000000000000000000000000000',
            },
          ),
        }),
      ).toBe(TransactionType.Unknown);
    });

    it('classifies a smart contract without call data as unknown', () => {
      expect(
        resolveTransactionType({
          rawData: buildRawData(TronwebTypes.ContractType.TriggerSmartContract),
        }),
      ).toBe(TransactionType.Unknown);
    });

    it.each([
      [TronwebTypes.ContractType.TransferContract, TransactionType.Send],
      [TronwebTypes.ContractType.TransferAssetContract, TransactionType.Send],
      [
        TronwebTypes.ContractType.FreezeBalanceV2Contract,
        TransactionType.StakeDeposit,
      ],
      [
        TronwebTypes.ContractType.WithdrawExpireUnfreezeContract,
        TransactionType.StakeWithdraw,
      ],
    ])(
      'falls back to the contract mapping for %s',
      (contractType, expected) => {
        expect(
          resolveTransactionType({ rawData: buildRawData(contractType) }),
        ).toBe(expected);
      },
    );
  });
});
