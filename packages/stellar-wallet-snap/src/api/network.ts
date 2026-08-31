/** Stellar Chain namespace */

import { enums } from '@metamask/superstruct';
import { KnownCaipNamespace } from '@metamask/utils';

/** Known CAIP-2 IDs */
/** Please see https://namespaces.chainagnostic.org/stellar/caip2 */
export const KnownCaip2ChainId = {
  Mainnet: `${KnownCaipNamespace.Stellar}:pubnet`,
  Testnet: `${KnownCaipNamespace.Stellar}:testnet`,
} as const;

export type KnownCaip2ChainId =
  (typeof KnownCaip2ChainId)[keyof typeof KnownCaip2ChainId];

export const KnownCaip2ChainIdStruct = enums(Object.values(KnownCaip2ChainId));
