import { Address, Networks, hash, xdr } from '@stellar/stellar-sdk';

import { bufferToUint8Array } from '../../utils/buffer';

export type BuildAuthEntryPreimageXdrOptions = {
  networkPassphrase?: string;
  args?: xdr.ScVal[];
  subInvocations?: xdr.SorobanAuthorizedInvocation[];
  /** When set, encode CAP-71 v2 bound to this `G…` account. */
  boundAddress?: string;
};

/**
 * Builds a base64 `HashIdPreimage` for SEP-43 `signAuthEntry` tests.
 * Omit `boundAddress` for v1; pass a G-address for CAP-71 v2.
 *
 * @param options - Preimage field overrides.
 * @param options.networkPassphrase - Network passphrase.
 * @param options.args - Function arguments.
 * @param options.subInvocations - Sub-invocations.
 * @param options.boundAddress - Bound address.
 * @returns Base64 XDR.
 */
export function buildAuthEntryPreimageXdr({
  networkPassphrase = Networks.PUBLIC,
  args = [],
  subInvocations = [],
  boundAddress,
}: BuildAuthEntryPreimageXdrOptions = {}): string {
  const invocation = new xdr.SorobanAuthorizedInvocation({
    function:
      xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.contract(
            bufferToUint8Array(new Uint8Array(32).fill(1)),
          ).toScAddress(),
          functionName: 'transfer',
          args,
        }),
      ),
    subInvocations,
  });
  const networkId = hash(bufferToUint8Array(networkPassphrase, 'utf8'));
  if (boundAddress === undefined) {
    return xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId,
        nonce: 123456789n,
        signatureExpirationLedger: 1_000_000,
        invocation,
      }),
    ).toXdr('base64');
  }
  return xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(
    new xdr.HashIdPreimageSorobanAuthorizationWithAddress({
      networkId,
      nonce: 123456789n,
      signatureExpirationLedger: 1_000_000,
      address: Address.fromString(boundAddress).toScAddress(),
      invocation,
    }),
  ).toXdr('base64');
}

/**
 * Builds a `CONTRACT_ID_PREIMAGE_FROM_ADDRESS` for create-contract tests.
 *
 * @param address - Account or contract strkey used as the preimage address.
 * @returns Contract id preimage XDR.
 */
export function buildContractIdPreimageFromAddress(
  address: string,
): xdr.ContractIdPreimage {
  return xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: Address.fromString(address).toScAddress(),
      // A 32-byte salt is required for contract id preimages.
      salt: bufferToUint8Array(
        '0000000000000000000000000000000000000000000000000000000000000000',
        'hex',
      ),
    }),
  );
}

/**
 * Builds a CAP-85 `CONTRACT_EXECUTABLE_EXTERNAL_REF`.
 *
 * @param owner - Executable owner contract strkey.
 * @param tag - Executable tag.
 * @returns Contract executable XDR.
 */
export function buildExternalRefExecutable(
  owner: string,
  tag: string,
): xdr.ContractExecutable {
  return xdr.ContractExecutable.contractExecutableExternalRef(
    new xdr.ContractExecutableExternalRef({
      executableOwner: Address.fromString(owner).toScAddress(),
      tag,
    }),
  );
}
