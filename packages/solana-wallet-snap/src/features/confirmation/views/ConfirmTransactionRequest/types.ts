import type { SolMethod } from '@metamask/keyring-api';
import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';

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
  origin: string;
  advanced: {
    shown: boolean;
    instructions: InstructionParseResult[];
  };
};
