/**
 * `HashIdPreimage.type` arms that SEP-43 `signAuthEntry` will sign.
 */
export const SorobanAuthPreimageType = {
  V1: 'envelopeTypeSorobanAuthorization',
  V2: 'envelopeTypeSorobanAuthorizationWithAddress',
} as const;

export type SorobanAuthPreimageType =
  (typeof SorobanAuthPreimageType)[keyof typeof SorobanAuthPreimageType];

/**
 * `SorobanCredentials.type` arms used when mapping invoke-host-function auth.
 */
export const SorobanCredentialsType = {
  Address: 'sorobanCredentialsAddress',
  AddressV2: 'sorobanCredentialsAddressV2',
} as const;

export type SorobanCredentialsType =
  (typeof SorobanCredentialsType)[keyof typeof SorobanCredentialsType];
