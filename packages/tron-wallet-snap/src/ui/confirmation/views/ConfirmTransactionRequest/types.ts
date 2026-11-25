import type { TransactionSecurityProperties } from '@metamask/snap-networks-utils';
import type { DialogResult, Json } from '@metamask/snaps-sdk';

import type { SpotPrices } from '../../../../clients/price-api/types';
import type { Network } from '../../../../constants';
import type { AssetEntity } from '../../../../entities/assets';
import type { ComputeFeeResult } from '../../../../services/send/types';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../types/snap';

export const CONFIRM_TRANSACTION_INTERFACE_NAME = 'confirmTransaction';

export type ConfirmTransactionRequestContext = {
  origin: string;
  scope: Network;
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  fees: ComputeFeeResult;
  asset: AssetEntity;
  preferences: Preferences;
  networkImage: string;
  tokenPrices: SpotPrices;
  tokenPricesFetchStatus: FetchStatus;
  scan: TransactionScanResult | null;
  scanFetchStatus: FetchStatus;
  acknowledgementScreen?: boolean;
  acknowledged?: boolean;
  transactionRawData: Json;
  accountType: string;
};

/**
 * The user's decision in the ConfirmTransactionRequest dialog, with context data.
 */
export type ConfirmTransactionRequestResult = {
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
