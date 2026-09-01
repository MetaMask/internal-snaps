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

export const SimulationStatus = {
  Completed: 'COMPLETED',
  Skipped: 'SKIPPED',
  Failed: 'FAILED',
} as const;

export type SimulationStatus =
  (typeof SimulationStatus)[keyof typeof SimulationStatus];

export type TransactionScanResult = {
  status: TransactionScanStatus;
  estimatedChanges: TransactionScanEstimatedChanges;
  validation: TransactionScanValidation;
  error: TransactionScanError | null;
  simulationStatus: SimulationStatus;
};

export const SecurityAlertResponse = {
  Benign: 'Benign',
  Warning: 'Warning',
  Malicious: 'Malicious',
} as const;

export type SecurityAlertResponse =
  (typeof SecurityAlertResponse)[keyof typeof SecurityAlertResponse];

export const ScanStatus = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
} as const;

export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];
