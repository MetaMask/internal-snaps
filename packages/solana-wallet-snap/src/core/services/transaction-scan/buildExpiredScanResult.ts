import type { TransactionScanResult } from './types';

export const TRANSACTION_BLOCKHASH_EXPIRED = 'TransactionBlockhashExpired';

/** A failed scan result used when a transaction's recent blockhash has expired. */
export const EXPIRED_TRANSACTION_SCAN: TransactionScanResult = {
  status: 'ERROR',
  estimatedChanges: { assets: [] },
  validation: { type: 'Benign', reason: null },
  error: {
    type: null,
    code: TRANSACTION_BLOCKHASH_EXPIRED,
  },
};
