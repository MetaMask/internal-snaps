import { TransactionType } from '@metamask/keyring-api';
import { Types as TronwebTypes } from 'tronweb';

/**
 * Classifies an unsigned or broadcast Tron transaction from its raw data.
 *
 * The contract type is the only classification signal available before a
 * transaction is confirmed: the account-balance comparison that
 * `TransactionMapper` performs for confirmed transactions is not possible here,
 * and a smart-contract call carries no ABI at this stage. Every contract that
 * the Snap itself builds for a transfer or a staking operation is still
 * identifiable, and the rest fall back to `unknown` rather than guessing.
 *
 * @param rawData - The transaction raw data, or `undefined` when unavailable.
 * @returns The keyring-api transaction type.
 */
export function mapRawTransactionType(
  rawData: TronwebTypes.Transaction['raw_data'] | undefined,
): TransactionType {
  const contractType = rawData?.contract?.[0]?.type;

  switch (contractType) {
    case TronwebTypes.ContractType.TransferContract:
    case TronwebTypes.ContractType.TransferAssetContract:
      return TransactionType.Send;
    case TronwebTypes.ContractType.FreezeBalanceContract:
    case TronwebTypes.ContractType.FreezeBalanceV2Contract:
      return TransactionType.StakeDeposit;
    case TronwebTypes.ContractType.UnfreezeBalanceContract:
    case TronwebTypes.ContractType.UnfreezeBalanceV2Contract:
    case TronwebTypes.ContractType.WithdrawExpireUnfreezeContract:
      return TransactionType.StakeWithdraw;
    default:
      return TransactionType.Unknown;
  }
}
