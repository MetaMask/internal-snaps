import type {
  ExtendedKeyringAccount,
  TransactionSecurityProperties,
} from '@metamask/snap-networks-utils';
import type { DialogResult } from '@metamask/snaps-sdk';

import type { SpotPrices } from '../../../../clients/price-api/types';
import type { Network } from '../../../../constants';
import type { ComputeFeeResult } from '../../../../services/send/types';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../types/snap';

export const CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME = 'confirmSignTransaction';

export type ConfirmSignTransactionContext = {
  scope: Network;
  account: ExtendedKeyringAccount | null;
  transaction: {
    rawDataHex: string;
    type: string;
  };
  origin: string;
  preferences: Preferences;
  networkImage: string;
  scan: TransactionScanResult | null;
  scanFetchStatus: FetchStatus;
  acknowledgementScreen?: boolean;
  acknowledged?: boolean;
  tokenPrices: SpotPrices;
  tokenPricesFetchStatus: FetchStatus;
  fees: ComputeFeeResult;
  feesFetchStatus: FetchStatus;
  isInsufficientBalance: boolean;
};

/**
 * The user's decision in the ConfirmSignTransaction dialog, with context data.
 */
export type ConfirmSignTransactionResult = {
  /** The dialog result. `true` when the user confirmed. */
  result: DialogResult;
  context: {
    /**
     * The security properties of the scan shown in the dialog, ready to report.
     * `undefined` when the dialog produced no security data.
     */
    securityProperties?: TransactionSecurityProperties;
  };
};
