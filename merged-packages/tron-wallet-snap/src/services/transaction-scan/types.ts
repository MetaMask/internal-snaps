import type { SecurityAlertSimulationValidationResponse } from '../../clients/security-alerts-api/types';

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
  type:
    | SecurityAlertSimulationValidationResponse['validation']['result_type']
    | null;
  reason:
    | SecurityAlertSimulationValidationResponse['validation']['reason']
    | null;
};

export type TransactionScanError = {
  type: string | null;
  code: string | null;
  message: string | null;
};

export type TransactionScanResult = {
  status: TransactionScanStatus;
  estimatedChanges: TransactionScanEstimatedChanges;
  validation: TransactionScanValidation;
  error: TransactionScanError | null;
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
