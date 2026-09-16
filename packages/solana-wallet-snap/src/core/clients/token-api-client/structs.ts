import { UrlStruct } from '@metamask/snap-networks-utils';
import {
  array,
  integer,
  optional,
  string,
  type as typeStruct,
} from '@metamask/superstruct';

import { TokenCaipAssetTypeFromStringStruct } from '../../constants/solana';

export const TokenMetadataStruct = typeStruct({
  decimals: integer(),
  assetId: TokenCaipAssetTypeFromStringStruct,
  name: optional(string()),
  symbol: optional(string()),
  iconUrl: optional(UrlStruct),
});

export const TokenMetadataResponseStruct = array(TokenMetadataStruct);
