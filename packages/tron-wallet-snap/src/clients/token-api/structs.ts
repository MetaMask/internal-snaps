import { UrlStruct } from '@metamask/snap-networks-utils';
import {
  array,
  integer,
  optional,
  string,
  type as typeStruct,
} from '@metamask/superstruct';

import { TokenCaipAssetTypeStruct } from '../../services/assets/types';

export const TokenMetadataStruct = typeStruct({
  decimals: integer(),
  assetId: TokenCaipAssetTypeStruct,
  name: optional(string()),
  symbol: optional(string()),
  iconUrl: optional(UrlStruct),
});

export const TokenMetadataResponseStruct = array(TokenMetadataStruct);
