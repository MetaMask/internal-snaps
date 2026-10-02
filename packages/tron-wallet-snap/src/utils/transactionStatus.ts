import { TransactionStatus } from '@metamask/keyring-api';

import type { FullNodeTransactionInfo } from '../clients/tron-http/types';

/**
 * Resolves the terminal status of a confirmed Tron transaction from its Full
 * Node `gettransactioninfobyid` response.
 *
 * `gettransactioninfobyid` only returns a result once the transaction is
 * included in a block, so the transaction is terminal by the time this is
 * called. Tron reports the outcome of a contract execution in `receipt.result`:
 * `SUCCESS` for a successful execution, and values such as `REVERT` or
 * `OUT_OF_ENERGY` when it failed.
 *
 * Only an explicit non-`SUCCESS` result maps to `failed`. A missing
 * `receipt.result` maps to `confirmed`, because plain transfers carry no
 * execution result and the absence of a failure signal is not a failure. This
 * mirrors the `contractRet` handling in `TransactionMapper`.
 *
 * @param transactionInfo - The Full Node transaction info.
 * @returns The keyring-api transaction status.
 */
export function mapTransactionInfoStatus(
  transactionInfo: FullNodeTransactionInfo,
): TransactionStatus {
  const result = transactionInfo.receipt?.result;
  const isFailed = result !== undefined && result !== 'SUCCESS';

  return isFailed ? TransactionStatus.Failed : TransactionStatus.Confirmed;
}
