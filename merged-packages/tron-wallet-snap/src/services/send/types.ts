import type { FeeType } from '@metamask/keyring-api';

import type {
  NativeCaipAssetType,
  ResourceCaipAssetType,
} from '../assets/types';

export type TransactionResult = {
  success: boolean;
  txId: string;
  transaction: any;
};

export type FeeAsset = {
  unit: string;
  type: NativeCaipAssetType | ResourceCaipAssetType;
  amount: string;
  fungible: true;
  imageSvg?: string;
};

export type ComputeFeeResult = {
  type: FeeType;
  asset: FeeAsset;
}[];
