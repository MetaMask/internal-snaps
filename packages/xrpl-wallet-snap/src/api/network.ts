import { enums } from '@metamask/superstruct';

/** Known CAIP-2 IDs */
/** Please see https://namespaces.chainagnostic.org/xrpl/caip2 */
export const KnownCaip2ChainId = {
  Mainnet: `xrpl:0`,
} as const;

export type KnownCaip2ChainId =
  (typeof KnownCaip2ChainId)[keyof typeof KnownCaip2ChainId];

export const KnownCaip2ChainIdStruct = enums(Object.values(KnownCaip2ChainId));
