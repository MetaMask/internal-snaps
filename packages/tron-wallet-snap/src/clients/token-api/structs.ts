import {
  array,
  integer,
  object,
  optional,
  string,
} from '@metamask/superstruct';

import { TokenCaipAssetTypeStruct } from '../../services/assets/types';
import { UrlStruct } from '../../validation/structs';

export const TokenMetadataStruct = object({
  decimals: integer(),
  assetId: TokenCaipAssetTypeStruct,
  name: optional(string()),
  symbol: optional(string()),
  iconUrl: optional(UrlStruct),
});

export const TokenMetadataResponseStruct = array(TokenMetadataStruct);
