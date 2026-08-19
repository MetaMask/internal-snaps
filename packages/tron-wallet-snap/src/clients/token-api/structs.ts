import { UrlStruct } from '@metamask/snap-networks-utils';
import {
  array,
  integer,
  object,
  optional,
  string,
} from '@metamask/superstruct';

import { TokenCaipAssetTypeStruct } from '../../services/assets/types';

export const TokenMetadataStruct = object({
  decimals: integer(),
  assetId: TokenCaipAssetTypeStruct,
  name: optional(string()),
  symbol: optional(string()),
  iconUrl: optional(UrlStruct),
});

export const TokenMetadataResponseStruct = array(TokenMetadataStruct);
