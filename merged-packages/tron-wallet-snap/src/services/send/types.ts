import type { FeeType } from '@metamask/keyring-api';

export type TransactionResult = {
  success: boolean;
  txId: string;
  transaction: any;
};

export type FeeAsset = {
  unit: string;
  type: string;
  amount: string;
  fungible: true;
  imageSvg: string;
};

export type ComputeFeeResult = {
  type: FeeType;
  asset: FeeAsset;
}[];
