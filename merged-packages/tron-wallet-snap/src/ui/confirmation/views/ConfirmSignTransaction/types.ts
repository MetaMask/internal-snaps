import type { SpotPrices } from '../../../../clients/price-api/types';
import type { Network } from '../../../../constants';
import type { TronKeyringAccount } from '../../../../entities';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../types/snap';

export const CONFIRM_SIGN_TRANSACTION_INTERFACE_NAME = 'confirmSignTransaction';

export type ConfirmSignTransactionContext = {
  scope: Network;
  account: TronKeyringAccount | null;
  transaction: {
    rawDataHex: string;
    type: string;
  };
  origin: string;
  preferences: Preferences;
  networkImage: string;
  scan: TransactionScanResult | null;
  scanFetchStatus: FetchStatus;
  tokenPrices: SpotPrices;
  tokenPricesFetchStatus: FetchStatus;
};
