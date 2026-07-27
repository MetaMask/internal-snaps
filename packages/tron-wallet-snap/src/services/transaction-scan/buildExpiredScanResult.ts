import { TRANSACTION_TAPOS_EXPIRED } from './isTransactionDeadlinePassedError';
import { SimulationStatus, type TransactionScanResult } from './types';

/**
 * A scan result that surfaces a locally-detected transaction expiry (Tron TAPOS
 * validity window passed) as a failed simulation with the TAPOS-expired marker.
 *
 * The security-API simulation does not validate TAPOS fields, so this is
 * synthesized by the snap and takes precedence over a benign simulation: an
 * expired transaction will not broadcast regardless of what the contract
 * simulation says. The marker is recognized by `isTransactionDeadlinePassedError`,
 * so the existing warning banner + submit-button logic light up automatically.
 */
export const EXPIRED_TRANSACTION_SCAN: TransactionScanResult = {
  status: 'ERROR',
  simulationStatus: SimulationStatus.Failed,
  estimatedChanges: { assets: [] },
  validation: { type: 'Benign', reason: null },
  error: {
    type: TRANSACTION_TAPOS_EXPIRED,
    code: null,
    message: null,
  },
};
