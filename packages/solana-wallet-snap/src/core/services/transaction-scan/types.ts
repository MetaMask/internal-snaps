export type TransactionScanStatus = 'SUCCESS' | 'ERROR';

export type TransactionScanAssetChange = {
  type: 'in' | 'out';
  value: number | null;
  price: number | null;
  symbol: string;
  name: string;
  logo: string | null;
};

export type TransactionScanEstimatedChanges = {
  assets: TransactionScanAssetChange[];
};

export type TransactionScanValidation = {
  type: string | null;
  reason: string | null;
  description?: string | null;
};

export type TransactionScanError = {
  type: 'simulation' | 'validation' | 'response' | null;
  code: string | null;
  message: string | null;
};

export type TransactionScanResult = {
  /** `ERROR` when the security scan failed (see `validationError`). */
  status: TransactionScanStatus;
  /** Null when the simulation failed or is missing. */
  estimatedChanges: TransactionScanEstimatedChanges | null;
  validation: TransactionScanValidation;
  /**
   * Simulation failure: an execution failure, or a requested simulation with no
   * result.
   */
  error: TransactionScanError | null;
  /**
   * Failure of the security scan itself: a validation error, an overall
   * response error, or requested results that are missing.
   */
  validationError: TransactionScanError | null;
};
