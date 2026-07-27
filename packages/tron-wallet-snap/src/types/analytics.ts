/**
 * Enum for transaction tracking event types.
 */
export enum TransactionEventType {
  TransactionAdded = 'Transaction Added',
  TransactionRejected = 'Transaction Rejected',
  TransactionApproved = 'Transaction Approved',
  TransactionSubmitted = 'Transaction Submitted',
  TransactionFinalized = 'Transaction Finalized',
}

/**
 * Enum for security alert tracking event types.
 */
export enum SecurityEventType {
  SecurityAlertDetected = 'Security Alert Detected',
  SecurityScanCompleted = 'Security Scan Completed',
}
