import type { Amount, Transaction } from '@metamask/bitcoindevkit';
import { TransactionType } from '@metamask/keyring-api';
import { mock } from 'jest-mock-extended';

import type { BitcoinAccount } from './account';
import {
  mapToTransactionType,
  resolveFlowTransactionType,
} from './transaction';

describe('mapToTransactionType', () => {
  const createAccount = (sentBtc: number): BitcoinAccount => {
    const sentAmount = mock<Amount>();
    jest.spyOn(sentAmount, 'to_btc').mockReturnValue(sentBtc);

    const account = mock<BitcoinAccount>();
    jest
      .spyOn(account, 'sentAndReceived')
      .mockReturnValue([sentAmount, mock<Amount>()]);
    return account;
  };

  it('classifies a transaction that spends funds as a send', () => {
    const account = createAccount(1);

    expect(mapToTransactionType(account, mock<Transaction>())).toBe(
      TransactionType.Send,
    );
  });

  it('classifies a transaction that spends nothing as a receive', () => {
    const account = createAccount(0);

    expect(mapToTransactionType(account, mock<Transaction>())).toBe(
      TransactionType.Receive,
    );
  });
});

describe('resolveFlowTransactionType', () => {
  const BITCOIN_MAINNET = 'bip122:000000000019d6689c085ae165831e93/slip44:0';
  const BITCOIN_MAINNET_USDC =
    'bip122:000000000019d6689c085ae165831e93/trc20:some-token';
  const EVM_USDC = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  it('returns bridgeSend when the assets are on different chains', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: BITCOIN_MAINNET,
        destAssetId: EVM_USDC,
      }),
    ).toBe(TransactionType.BridgeSend);
  });

  it('returns swap when both assets are on the same chain', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: BITCOIN_MAINNET,
        destAssetId: BITCOIN_MAINNET_USDC,
      }),
    ).toBe(TransactionType.Swap);
  });

  it('returns undefined when the source asset id is missing', () => {
    expect(
      resolveFlowTransactionType({ destAssetId: EVM_USDC }),
    ).toBeUndefined();
  });

  it('returns undefined when the destination asset id is missing', () => {
    expect(
      resolveFlowTransactionType({ sourceAssetId: BITCOIN_MAINNET }),
    ).toBeUndefined();
  });

  it('returns undefined when an asset id cannot be parsed', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: 'not-an-asset-id' as never,
        destAssetId: EVM_USDC,
      }),
    ).toBeUndefined();
  });
});
