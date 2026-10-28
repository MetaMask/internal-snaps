import type { Rpc, SolanaRpcApi } from '@solana/kit';
import {
  appendTransactionMessageInstructions,
  address,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';

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
  simulateTransaction: jest.Mock;
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
  const simulateTransaction = jest.fn();

  return {
    rpc: {
      getMultipleAccounts,
      getMinimumBalanceForRentExemption,
      simulateTransaction,
    } as unknown as Rpc<SolanaRpcApi>,
    getMultipleAccounts,
    getMinimumBalanceForRentExemption,
    simulateTransaction,
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

  describe('simulateInnerInstructions', () => {
    const transaction = getBase64EncodedWireTransaction(
      compileTransaction(
        pipe(
          createTransactionMessage({ version: 0 }),
          (message) => setTransactionMessageFeePayer(address(sponsor), message),
          (message) =>
            setTransactionMessageLifetimeUsingBlockhash(
              {
                blockhash: blockhash('11111111111111111111111111111111'),
                lastValidBlockHeight: 0n,
              },
              message,
            ),
          (message) => appendTransactionMessageInstructions([], message),
        ),
      ),
    );
    const createAccount = {
      programId: '11111111111111111111111111111111',
      program: 'system',
      parsed: { type: 'createAccount', info: { source: sponsor } },
    };

    it('returns the invoked instructions without verifying signatures', async () => {
      const { rpc, simulateTransaction } = buildRpc();
      simulateTransaction.mockReturnValue({
        send: jest.fn().mockResolvedValue({
          value: {
            // eslint-disable-next-line id-denylist -- RPC response field
            err: null,
            innerInstructions: [
              { index: 0, instructions: [createAccount] },
              { index: 1, instructions: [createAccount] },
            ],
          },
        }),
      });
      const reader = createFeePaymentChainReader(
        rpc,
        Network.Mainnet,
        jest.fn(),
      );

      expect(await reader.simulateInnerInstructions(transaction)).toStrictEqual(
        [createAccount, createAccount],
      );
      expect(simulateTransaction).toHaveBeenCalledWith(transaction, {
        encoding: 'base64',
        innerInstructions: true,
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
    });

    it('returns null when the simulated transaction fails', async () => {
      const { rpc, simulateTransaction } = buildRpc();
      simulateTransaction.mockReturnValue({
        send: jest.fn().mockResolvedValue({
          // eslint-disable-next-line id-denylist -- RPC response field
          value: { err: 'InsufficientFundsForFee', innerInstructions: [] },
        }),
      });
      const reader = createFeePaymentChainReader(
        rpc,
        Network.Mainnet,
        jest.fn(),
      );

      expect(await reader.simulateInnerInstructions(transaction)).toBeNull();
    });

    it('returns null when the simulation request fails', async () => {
      const { rpc, simulateTransaction } = buildRpc();
      simulateTransaction.mockReturnValue({
        send: jest.fn().mockRejectedValue(new Error('RPC down')),
      });
      const reader = createFeePaymentChainReader(
        rpc,
        Network.Mainnet,
        jest.fn(),
      );

      expect(await reader.simulateInnerInstructions(transaction)).toBeNull();
    });
  });
});
