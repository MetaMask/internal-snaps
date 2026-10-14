import type { CaipAssetType } from '@metamask/utils';
import { address } from '@solana/kit';
import type { Rpc, SolanaRpcApi } from '@solana/kit';

import type { Network } from '../../../core/constants/solana';
import { tokenAddressToCaip19 } from '../../../core/utils/tokenAddressToCaip19';
import type {
  AccountSnapshot,
  FeePaymentChainReader,
} from './analyzeFeePayment';

type TokenAccountInfo = {
  owner?: string;
  mint?: string;
  tokenAmount?: { decimals?: number };
};

/**
 * Builds the on-chain reader used by {@link analyzeFeePayment}.
 *
 * @param rpc - The RPC of the network the transaction is sent to.
 * @param scope - The network the transaction is sent to.
 * @param getAssetsMetadata - Returns the metadata of the given assets.
 * @returns The chain reader.
 */
export const createFeePaymentChainReader = (
  rpc: Rpc<SolanaRpcApi>,
  scope: Network,
  getAssetsMetadata: (
    assetTypes: CaipAssetType[],
  ) => Promise<Record<CaipAssetType, { symbol?: string } | null>>,
): FeePaymentChainReader => ({
  async getAccounts(addresses): Promise<Record<string, AccountSnapshot>> {
    const { value } = await rpc
      .getMultipleAccounts(addresses.map(address), { encoding: 'jsonParsed' })
      .send();

    return Object.fromEntries(
      addresses.map((account, index): [string, AccountSnapshot] => {
        const accountInfo = value[index];
        if (!accountInfo) {
          return [account, null];
        }

        const { data } = accountInfo;
        // Accounts the RPC cannot parse come back as a base64 tuple.
        const info = Array.isArray(data)
          ? undefined
          : (data as { parsed?: { info?: TokenAccountInfo } }).parsed?.info;

        return [
          account,
          {
            tokenOwner: info?.owner ?? null,
            mint: info?.mint ?? null,
            decimals: info?.tokenAmount?.decimals ?? null,
          },
        ];
      }),
    );
  },

  async getRentExemptMinimum(space): Promise<bigint> {
    return rpc.getMinimumBalanceForRentExemption(BigInt(space)).send();
  },

  async getTokenSymbol(mint): Promise<string | null> {
    try {
      const assetType = tokenAddressToCaip19(scope, mint);
      const metadata = await getAssetsMetadata([assetType]);
      return metadata[assetType]?.symbol ?? null;
    } catch {
      return null;
    }
  },
});
