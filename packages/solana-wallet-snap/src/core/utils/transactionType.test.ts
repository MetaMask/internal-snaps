import { TransactionType } from '@metamask/keyring-api';

import { METAMASK_ORIGIN } from '../constants/solana';
import {
  resolveFlowTransactionType,
  resolveTransactionType,
} from './transactionType';

describe('resolveTransactionType', () => {
  it('uses the classification supplied by the caller when present', () => {
    expect(
      resolveTransactionType({
        origin: METAMASK_ORIGIN,
        transactionType: TransactionType.Receive,
      }),
    ).toBe(TransactionType.Receive);
  });

  it('prefers the supplied classification over the origin-derived one', () => {
    expect(
      resolveTransactionType({
        origin: 'https://example.com',
        transactionType: TransactionType.Swap,
      }),
    ).toBe(TransactionType.Swap);
  });

  it('reports a MetaMask-originated transaction as a send', () => {
    expect(resolveTransactionType({ origin: METAMASK_ORIGIN })).toBe(
      TransactionType.Send,
    );
  });

  it('reports a dApp-originated transaction as unknown', () => {
    expect(resolveTransactionType({ origin: 'https://example.com' })).toBe(
      TransactionType.Unknown,
    );
  });

  it('does not treat the MetaMask origin URL as the MetaMask origin', () => {
    expect(resolveTransactionType({ origin: 'https://metamask.io' })).toBe(
      TransactionType.Unknown,
    );
  });
});

describe('resolveFlowTransactionType', () => {
  const SOLANA_MAINNET_SOL =
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
  const SOLANA_MAINNET_USDC =
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const EVM_USDC = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  it('returns bridgeSend when the assets are on different chains', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: SOLANA_MAINNET_USDC,
        destAssetId: EVM_USDC,
      }),
    ).toBe(TransactionType.BridgeSend);
  });

  it('returns swap when both assets are on the same chain', () => {
    expect(
      resolveFlowTransactionType({
        sourceAssetId: SOLANA_MAINNET_SOL,
        destAssetId: SOLANA_MAINNET_USDC,
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
      resolveFlowTransactionType({ sourceAssetId: SOLANA_MAINNET_SOL }),
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
