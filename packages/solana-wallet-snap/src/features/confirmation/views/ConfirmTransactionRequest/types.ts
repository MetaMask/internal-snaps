import type { SolMethod } from '@metamask/keyring-api';
import type {
  ExtendedKeyringAccount,
  TransactionSecurityProperties,
} from '@metamask/snap-networks-utils';

import type { SpotPrices } from '../../../../core/clients/price-api/types';
import type { Network } from '../../../../core/constants/solana';
import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { FetchStatus, Preferences } from '../../../../core/types/snap';
import type { InstructionParseResult } from '../../../../entities';
import type { FeePayment } from '../../utils/analyzeFeePayment';

export type ConfirmTransactionRequestContext = {
  method: SolMethod;
  scope: Network;
  networkImage: string | null;
  account: ExtendedKeyringAccount | null;
  accountDomain: string | null;
  destinationAddress: string | null;
  destinationDomain: string | null;
  preferences: Preferences;
  transaction: string;
  feeEstimatedInSol: string | null;
  /** Who pays the network fee, and what the user pays when it is sponsored. */
  feePayment: FeePayment | null;
  tokenPrices: SpotPrices;
  tokenPricesFetchStatus: FetchStatus;
  scan: TransactionScanResult | null;
  scanFetchStatus: FetchStatus;
  /** Local expiry is independent of API availability; absent in older contexts. */
  transactionExpired?: boolean;
  /** Whether the malicious-acknowledgement screen is currently shown. */
  acknowledgementScreen: boolean;
  /** Whether the malicious-risk checkbox is currently checked. */
  acknowledged: boolean;
  origin: string;
  advanced: {
    shown: boolean;
    instructions: InstructionParseResult[];
  };
};

/**
 * The user's decision in the ConfirmTransactionRequest dialog, with context data.
 */
export type ConfirmTransactionRequestResult = {
  /** Whether the user confirmed the transaction. */
  confirmed: boolean;
  context: {
    /**
     * The security properties of the verdict shown in the dialog, ready to
     * report. Omitted when the dialog produced no security data.
     */
    securityProperties?: TransactionSecurityProperties;
  };
};
