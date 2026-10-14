import type { Rpc, SolanaRpcApi } from '@solana/kit';

import { Network } from '../../../core/constants/solana';
import { createFeePaymentChainReader } from './createFeePaymentChainReader';

const sponsor = 'CDg3bPoM21fSXEzrXWHWyJR33JHX6xaYboq5p7s4uo48';
const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const tokenAccount = 'xDTVdH7CGuDhRebhtfSxE33ZL1crUKwM3GnSb9a7DKm';
const walletAccount = '9wt9PfjPD3JCy5r7o4K1cTGiuTG7fq2pQhdDCdQALKjg';
const missingAccount = '61DFfeTKM7trxYcPQCM78bJ794ddZprZpAwAnLiwTpYH';

const buildRpc = (): {
  rpc: Rpc<SolanaRpcApi>;
  getMultipleAccounts: jest.Mock;
  getMinimumBalanceForRentExemption: jest.Mock;
} => {
  const getMultipleAccounts = jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue({
      value: [
        {
          data: {
            parsed: {
              info: {
                owner: sponsor,
                mint: usdcMint,
                tokenAmount: { decimals: 6 },
              },
            },
          },
        },
        { data: ['', 'base64'] },
        null,
      ],
    }),
  });
  const getMinimumBalanceForRentExemption = jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue(2_039_280n),
  });

  return {
    rpc: {
      getMultipleAccounts,
      getMinimumBalanceForRentExemption,
    } as unknown as Rpc<SolanaRpcApi>,
    getMultipleAccounts,
    getMinimumBalanceForRentExemption,
  };
};

describe('createFeePaymentChainReader', () => {
  it('reads token account owners, mints and decimals', async () => {
    const { rpc, getMultipleAccounts } = buildRpc();
    const reader = createFeePaymentChainReader(rpc, Network.Mainnet, jest.fn());

    const accounts = await reader.getAccounts([
      tokenAccount,
      walletAccount,
      missingAccount,
    ]);

    expect(getMultipleAccounts).toHaveBeenCalledWith(
      [tokenAccount, walletAccount, missingAccount],
      { encoding: 'jsonParsed' },
    );
    expect(accounts).toStrictEqual({
      [tokenAccount]: { tokenOwner: sponsor, mint: usdcMint, decimals: 6 },
      [walletAccount]: { tokenOwner: null, mint: null, decimals: null },
      [missingAccount]: null,
    });
  });

  it('reads the rent-exempt minimum for an account size', async () => {
    const { rpc, getMinimumBalanceForRentExemption } = buildRpc();
    const reader = createFeePaymentChainReader(rpc, Network.Mainnet, jest.fn());

    expect(await reader.getRentExemptMinimum(165)).toBe(2_039_280n);
    expect(getMinimumBalanceForRentExemption).toHaveBeenCalledWith(165n);
  });

  it('reads the token symbol from the asset metadata', async () => {
    const getAssetsMetadata = jest.fn().mockResolvedValue({
      [`${Network.Mainnet}/token:${usdcMint}`]: { symbol: 'USDC' },
    });
    const reader = createFeePaymentChainReader(
      buildRpc().rpc,
      Network.Mainnet,
      getAssetsMetadata,
    );

    expect(await reader.getTokenSymbol(usdcMint)).toBe('USDC');
  });

  it('returns no symbol when the metadata lookup fails', async () => {
    const reader = createFeePaymentChainReader(
      buildRpc().rpc,
      Network.Mainnet,
      jest.fn().mockRejectedValue(new Error('Token API down')),
    );

    expect(await reader.getTokenSymbol(usdcMint)).toBeNull();
  });
});
