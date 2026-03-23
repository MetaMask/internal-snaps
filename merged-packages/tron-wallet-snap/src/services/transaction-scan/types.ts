export type TransactionScanStatus = 'SUCCESS' | 'ERROR';

export type TransactionScanAssetChange = {
  type: 'in' | 'out';
  value: string;
  price: string | null;
  symbol: string;
  name: string;
  logo: string | null;
  assetType: string;
};

export type TransactionScanEstimatedChanges = {
  assets: TransactionScanAssetChange[];
};

export type TransactionScanValidation = {
  type: 'Benign' | 'Warning' | 'Malicious' | 'Error' | null;
  reason: string | null;
};

export type TransactionScanError = {
  type: string | null;
  code: string | null;
  message: string | null;
};

export enum SimulationStatus {
  Completed = 'COMPLETED',
  Skipped = 'SKIPPED',
  Failed = 'FAILED',
}

export type TransactionScanResult = {
  status: TransactionScanStatus;
  estimatedChanges: TransactionScanEstimatedChanges;
  validation: TransactionScanValidation;
  error: TransactionScanError | null;
  simulationStatus: SimulationStatus;
};

export enum SecurityAlertResponse {
  Benign = 'Benign',
  Warning = 'Warning',
  Malicious = 'Malicious',
}

export enum ScanStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}
