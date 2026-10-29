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
};

export type TransactionScanError = {
  type: 'simulation' | 'validation' | 'response' | null;
  code: string | null;
  message: string | null;
};

export type TransactionScanResult = {
  status: TransactionScanStatus;
  estimatedChanges: TransactionScanEstimatedChanges;
  validation: TransactionScanValidation;
  error: TransactionScanError | null;
};
