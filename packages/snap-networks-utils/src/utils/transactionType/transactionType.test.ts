import { TransactionType } from '@metamask/keyring-api';
import type { CaipAssetType } from '@metamask/utils';

import { resolveFlowTransactionType } from './transactionType';

describe('resolveFlowTransactionType', () => {
  const TRON_MAINNET_TRX: CaipAssetType = 'tron:728126428/slip44:195';
  const TRON_MAINNET_USDT: CaipAssetType =
    'tron:728126428/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const ETHEREUM_MAINNET_USDC: CaipAssetType =
    'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  it('returns swap for assets on the same chain', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: TRON_MAINNET_TRX,
        destAssetId: TRON_MAINNET_USDT,
      }),
    ).toBe(TransactionType.Swap);
  });

  it('returns bridgeSend for assets on different chains', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: TRON_MAINNET_USDT,
        destAssetId: ETHEREUM_MAINNET_USDC,
      }),
    ).toBe(TransactionType.BridgeSend);
  });

  it.each([
    { sourceAssetId: undefined, destAssetId: ETHEREUM_MAINNET_USDC },
    { sourceAssetId: TRON_MAINNET_TRX, destAssetId: undefined },
  ])('returns undefined when an asset id is missing', (options) => {
    expect(resolveFlowTransactionType(options)).toBeUndefined();
  });

  it('returns undefined when an asset id is malformed', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: 'not-an-asset-id' as never,
        destAssetId: ETHEREUM_MAINNET_USDC,
      }),
    ).toBeUndefined();
  });
});
