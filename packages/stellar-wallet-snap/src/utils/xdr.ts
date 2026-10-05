import { Address, xdr } from '@stellar/stellar-sdk';

import { bufferToUint8Array } from './buffer';

/**
 * `HashIdPreimage.type` arms that SEP-43 `signAuthEntry` will sign.
 */
export const SorobanAuthPreimageType = {
  V1: 'envelopeTypeSorobanAuthorization',
  V2: 'envelopeTypeSorobanAuthorizationWithAddress',
} as const;

/**
 * `SorobanCredentials.type` arms used when mapping invoke-host-function auth.
 */
export const SorobanCredentialsType = {
  Address: 'sorobanCredentialsAddress',
  AddressV2: 'sorobanCredentialsAddressV2',
} as const;

/**
 * `HostFunction.type` arms decoded for invoke-host-function confirmation.
 */
export const HostFunctionType = {
  InvokeContract: 'hostFunctionTypeInvokeContract',
  CreateContract: 'hostFunctionTypeCreateContract',
  CreateContractV2: 'hostFunctionTypeCreateContractV2',
  UploadContractWasm: 'hostFunctionTypeUploadContractWasm',
} as const;

/**
 * `ContractExecutable.type` arms, including CAP-85 `EXTERNAL_REF`.
 */
export const ContractExecutableType = {
  Wasm: 'contractExecutableWasm',
  StellarAsset: 'contractExecutableStellarAsset',
  ExternalRef: 'contractExecutableExternalRef',
} as const;

/**
 * `SorobanAuthorizedFunction.type` arms on auth-entry invocations.
 */
export const SorobanAuthorizedFunctionType = {
  ContractFn: 'sorobanAuthorizedFunctionTypeContractFn',
  CreateContractHostFn: 'sorobanAuthorizedFunctionTypeCreateContractHostFn',
  CreateContractV2HostFn: 'sorobanAuthorizedFunctionTypeCreateContractV2HostFn',
} as const;

/**
 * `ContractIdPreimage.type` arms used when mapping create-contract confirmation.
 */
export const ContractIdPreimageType = {
  ContractIdPreimageFromAddress: 'contractIdPreimageFromAddress',
  ContractIdPreimageFromAsset: 'contractIdPreimageFromAsset',
} as const;

export type ContractIdPreimageType =
  (typeof ContractIdPreimageType)[keyof typeof ContractIdPreimageType];

export type ContractExecutableType =
  (typeof ContractExecutableType)[keyof typeof ContractExecutableType];

export type HostFunctionType =
  (typeof HostFunctionType)[keyof typeof HostFunctionType];

export type SorobanAuthPreimageType =
  (typeof SorobanAuthPreimageType)[keyof typeof SorobanAuthPreimageType];

export type SorobanAuthorizedFunctionType =
  (typeof SorobanAuthorizedFunctionType)[keyof typeof SorobanAuthorizedFunctionType];

export type SorobanCredentialsType =
  (typeof SorobanCredentialsType)[keyof typeof SorobanCredentialsType];

export type SorobanAuthPreimageV1 = Extract<
  xdr.HashIdPreimage,
  { type: typeof SorobanAuthPreimageType.V1 }
>;

export type SorobanAuthPreimageV2 = Extract<
  xdr.HashIdPreimage,
  { type: typeof SorobanAuthPreimageType.V2 }
>;

export type CredentialAddressV1 = Extract<
  xdr.SorobanCredentials,
  { type: typeof SorobanCredentialsType.Address }
>;

export type CredentialAddressV2 = Extract<
  xdr.SorobanCredentials,
  { type: typeof SorobanCredentialsType.AddressV2 }
>;

/**
 * Narrows a `HashIdPreimage` to the v1 Soroban authorization arm.
 *
 * @param preimage - Decoded `HashIdPreimage`.
 * @returns True when `type` is `envelopeTypeSorobanAuthorization`.
 */
export function isSorobanAuthPreimageV1(
  preimage: xdr.HashIdPreimage,
): preimage is SorobanAuthPreimageV1 {
  return preimage.type === SorobanAuthPreimageType.V1;
}

/**
 * Narrows a `HashIdPreimage` to the CAP-71 v2 Soroban authorization arm.
 *
 * @param preimage - Decoded `HashIdPreimage`.
 * @returns True when `type` is `envelopeTypeSorobanAuthorizationWithAddress`.
 */
export function isSorobanAuthPreimageV2(
  preimage: xdr.HashIdPreimage,
): preimage is SorobanAuthPreimageV2 {
  return preimage.type === SorobanAuthPreimageType.V2;
}

/**
 * Narrows Soroban credentials to the v1 address arm.
 *
 * @param credentials - Decoded `SorobanCredentials`.
 * @returns True when `type` is `sorobanCredentialsAddress`.
 */
export function isCredentialAddressV1(
  credentials: xdr.SorobanCredentials,
): credentials is CredentialAddressV1 {
  return credentials.type === SorobanCredentialsType.Address;
}

/**
 * Narrows Soroban credentials to the CAP-71 v2 address arm.
 *
 * @param credentials - Decoded `SorobanCredentials`.
 * @returns True when `type` is `sorobanCredentialsAddressV2`.
 */
export function isCredentialAddressV2(
  credentials: xdr.SorobanCredentials,
): credentials is CredentialAddressV2 {
  return credentials.type === SorobanCredentialsType.AddressV2;
}

/**
 * Narrows a `ContractIdPreimage` to the `contractIdPreimageFromAddress` arm.
 *
 * @param preimage - Decoded `ContractIdPreimage`.
 * @returns True when `type` is `contractIdPreimageFromAddress`.
 */
export function isContractIdPreimageAddress(
  preimage: xdr.ContractIdPreimage,
): preimage is xdr.ContractIdPreimageAddress {
  return preimage.type === ContractIdPreimageType.ContractIdPreimageFromAddress;
}

/**
 * Narrows a `ContractIdPreimage` to the `contractIdPreimageFromAsset` arm.
 *
 * @param preimage - Decoded `ContractIdPreimage`.
 * @returns True when `type` is `contractIdPreimageFromAsset`.
 */
export function isContractIdPreimageAsset(
  preimage: xdr.ContractIdPreimage,
): preimage is xdr.ContractIdPreimageAsset {
  return preimage.type === ContractIdPreimageType.ContractIdPreimageFromAsset;
}

/**
 * Narrows a `ContractExecutable` to the `contractExecutableWasm` arm.
 *
 * @param executable - Decoded `ContractExecutable`.
 * @returns True when `type` is `contractExecutableWasm`.
 */
export function isContractExecutableWasm(
  executable: xdr.ContractExecutable,
): executable is xdr.ContractExecutableWasm {
  return executable.type === ContractExecutableType.Wasm;
}

/**
 * Narrows a `ContractExecutable` to the `contractExecutableExternalRef` arm.
 *
 * @param executable - Decoded `ContractExecutable`.
 * @returns True when `type` is `contractExecutableExternalRef`.
 */
export function isContractExecutableExternalRef(
  executable: xdr.ContractExecutable,
): executable is xdr.ContractExecutableExternalRefArm {
  return executable.type === ContractExecutableType.ExternalRef;
}

/**
 * Narrows a host function to `CREATE_CONTRACT_V2`.
 *
 * @param hostFunction - Decoded `HostFunction`, if present.
 * @returns True when `type` is `hostFunctionTypeCreateContractV2`.
 */
export function isCreateContractV2(
  hostFunction: xdr.HostFunction | undefined,
): hostFunction is xdr.HostFunctionCreateContractV2 {
  return hostFunction?.type === HostFunctionType.CreateContractV2;
}

/**
 * Narrows a host function to `CREATE_CONTRACT`.
 *
 * @param hostFunction - Decoded `HostFunction`, if present.
 * @returns True when `type` is `hostFunctionTypeCreateContract`.
 */
export function isCreateContractV1(
  hostFunction: xdr.HostFunction | undefined,
): hostFunction is xdr.HostFunctionCreateContract {
  return hostFunction?.type === HostFunctionType.CreateContract;
}

/**
 * Narrows a host function to `UPLOAD_CONTRACT_WASM`.
 *
 * @param hostFunction - Decoded `HostFunction`, if present.
 * @returns True when `type` is `hostFunctionTypeUploadContractWasm`.
 */
export function isUploadContractWasm(
  hostFunction: xdr.HostFunction | undefined,
): hostFunction is xdr.HostFunctionUploadContractWasm {
  return hostFunction?.type === HostFunctionType.UploadContractWasm;
}

/**
 * Narrows a host function to `INVOKE_CONTRACT`.
 *
 * @param hostFunction - Decoded `HostFunction`, if present.
 * @returns True when `type` is `hostFunctionTypeInvokeContract`.
 */
export function isInvokeContract(
  hostFunction: xdr.HostFunction | undefined,
): hostFunction is xdr.HostFunctionInvokeContract {
  return hostFunction?.type === HostFunctionType.InvokeContract;
}

/**
 * Gets the Soroban authorization address from a `SorobanAuthorizationEntry`.
 *
 * @param entry - Decoded `SorobanAuthorizationEntry`.
 * @returns Strkey-encoded address or null if the credentials are not an address.
 */
export function getSorobanAuthAddressFromAuthEntrySafe(
  entry: xdr.SorobanAuthorizationEntry,
): string | null {
  try {
    const { credentials } = entry;
    if (isCredentialAddressV1(credentials)) {
      return getAddress(credentials.address.address);
    }
    if (isCredentialAddressV2(credentials)) {
      return getAddress(credentials.addressV2.address);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Converts an XDR {@link xdr.ScAddress} to a Stellar strkey string (`G…` / `C…`).
 *
 * @param scAddress - Contract or account address from invoke / auth XDR.
 * @returns Strkey-encoded address.
 */
export function getAddress(scAddress: xdr.ScAddress): string {
  return Address.fromScAddress(scAddress).toString();
}

/**
 * Normalizes a Soroban contract function name (`SCSymbol`) to a UTF-8 string.
 *
 * The SDK types `functionName` as `xdr.XdrString` (UTF-8). Older call sites
 * may still pass a plain string or raw bytes.
 *
 * @param fnName - Value from `invokeContract.functionName` / auth `contractFn`.
 * @returns UTF-8 function name.
 */
export function getFunctionName(
  fnName: string | Uint8Array | { toString: () => string },
): string {
  if (typeof fnName === 'string') {
    return fnName;
  }
  if (fnName instanceof Uint8Array) {
    return bufferToUint8Array(fnName).toString('utf8');
  }
  return fnName.toString();
}
