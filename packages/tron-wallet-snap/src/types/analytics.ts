/**
 * Enum for transaction tracking event types.
 */
export const TransactionEventType = {
  TransactionAdded: 'Transaction Added',
  TransactionRejected: 'Transaction Rejected',
  TransactionApproved: 'Transaction Approved',
  TransactionSubmitted: 'Transaction Submitted',
  TransactionFinalized: 'Transaction Finalized',
} as const;

export type TransactionEventType =
  (typeof TransactionEventType)[keyof typeof TransactionEventType];

/**
 * Enum for security alert tracking event types.
 */
export const SecurityEventType = {
  SecurityAlertDetected: 'Security Alert Detected',
  SecurityScanCompleted: 'Security Scan Completed',
} as const;

export type SecurityEventType =
  (typeof SecurityEventType)[keyof typeof SecurityEventType];
