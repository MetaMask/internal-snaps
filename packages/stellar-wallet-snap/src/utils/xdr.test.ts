import { Address, Asset, Keypair, xdr } from '@stellar/stellar-sdk';

import {
  buildAuthEntryPreimageXdr,
  buildContractIdPreimageFromAddress,
  buildExternalRefExecutable,
} from '../api/__mocks__/xdr.fixtures';
import { bufferToUint8Array } from './buffer';
import {
  getAddress,
  getFunctionName,
  getSorobanAuthAddressFromAuthEntrySafe,
  isContractExecutableExternalRef,
  isContractExecutableWasm,
  isContractIdPreimageAddress,
  isContractIdPreimageAsset,
  isCreateContractV1,
  isCreateContractV2,
  isCredentialAddressV1,
  isCredentialAddressV2,
  isInvokeContract,
  isSorobanAuthPreimageV1,
  isSorobanAuthPreimageV2,
  isUploadContractWasm,
} from './xdr';

const accountAddress =
  'GA7UCNSASSOPQYTRGJ2NC7TDBSXHMWK6JHS7AO6X2ZQAIQSTB5ELNFSO';
const contractId = 'CASUP2OPFVEHCWGP2XLBXOV7DQIQIT42AQISG4MXAZGNLVFFN63X7WRT';

/**
 * Builds address credentials wrapping a G-address.
 *
 * @param address - Account strkey.
 * @returns Address credentials XDR.
 */
function addressCredentials(address: string): xdr.SorobanAddressCredentials {
  return new xdr.SorobanAddressCredentials({
    address: Address.fromString(address).toScAddress(),
    nonce: 1n,
    signatureExpirationLedger: 1_000_000,
    signature: xdr.ScVal.scvVoid(),
  });
}

/**
 * Builds an auth entry with the given credentials.
 *
 * @param credentials - Soroban credentials.
 * @returns Authorization entry XDR.
 */
function authEntry(
  credentials: xdr.SorobanCredentials,
): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function:
        xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(contractId).toScAddress(),
            functionName: 'transfer',
            args: [],
          }),
        ),
      subInvocations: [],
    }),
  });
}

describe('isSorobanAuthPreimageV1', () => {
  it('narrows v1 HashIdPreimage', () => {
    const preimage = xdr.HashIdPreimage.fromXdr(
      buildAuthEntryPreimageXdr(),
      'base64',
    );

    expect(isSorobanAuthPreimageV1(preimage)).toBe(true);
    expect(isSorobanAuthPreimageV2(preimage)).toBe(false);
  });
});

describe('isSorobanAuthPreimageV2', () => {
  it('narrows CAP-71 v2 HashIdPreimage', () => {
    const preimage = xdr.HashIdPreimage.fromXdr(
      buildAuthEntryPreimageXdr({ boundAddress: accountAddress }),
      'base64',
    );

    expect(isSorobanAuthPreimageV2(preimage)).toBe(true);
    expect(isSorobanAuthPreimageV1(preimage)).toBe(false);
  });
});

describe('isCredentialAddressV1', () => {
  it('narrows v1 address credentials', () => {
    const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
      addressCredentials(accountAddress),
    );

    expect(isCredentialAddressV1(credentials)).toBe(true);
    expect(isCredentialAddressV2(credentials)).toBe(false);
  });

  it('returns false for source-account credentials', () => {
    const credentials =
      xdr.SorobanCredentials.sorobanCredentialsSourceAccount();

    expect(isCredentialAddressV1(credentials)).toBe(false);
    expect(isCredentialAddressV2(credentials)).toBe(false);
  });
});

describe('isCredentialAddressV2', () => {
  it('narrows CAP-71 v2 address credentials', () => {
    const credentials = xdr.SorobanCredentials.sorobanCredentialsAddressV2(
      addressCredentials(accountAddress),
    );

    expect(isCredentialAddressV2(credentials)).toBe(true);
    expect(isCredentialAddressV1(credentials)).toBe(false);
  });
});

describe('getAddress', () => {
  it('converts contract ScAddress to a C-strkey', () => {
    expect(getAddress(Address.fromString(contractId).toScAddress())).toBe(
      contractId,
    );
  });

  it('converts account ScAddress to a G-strkey', () => {
    expect(getAddress(Address.fromString(accountAddress).toScAddress())).toBe(
      accountAddress,
    );
  });
});

describe('getFunctionName', () => {
  it('returns string function names unchanged', () => {
    expect(getFunctionName('approve')).toBe('approve');
  });

  it('decodes byte function names as UTF-8', () => {
    expect(getFunctionName(bufferToUint8Array('transfer', 'utf8'))).toBe(
      'transfer',
    );
  });

  it('uses toString for SDK string wrappers', () => {
    expect(getFunctionName({ toString: () => 'mint' })).toBe('mint');
  });
});

describe('getSorobanAuthAddressFromAuthEntrySafe', () => {
  it('returns the v1 credential address', () => {
    const authorizedAddress = Keypair.random().publicKey();
    const entry = authEntry(
      xdr.SorobanCredentials.sorobanCredentialsAddress(
        addressCredentials(authorizedAddress),
      ),
    );

    expect(getSorobanAuthAddressFromAuthEntrySafe(entry)).toBe(
      authorizedAddress,
    );
  });

  it('returns the v2 credential address', () => {
    const authorizedAddress = Keypair.random().publicKey();
    const entry = authEntry(
      xdr.SorobanCredentials.sorobanCredentialsAddressV2(
        addressCredentials(authorizedAddress),
      ),
    );

    expect(getSorobanAuthAddressFromAuthEntrySafe(entry)).toBe(
      authorizedAddress,
    );
  });

  it('returns null for source-account credentials', () => {
    const entry = authEntry(
      xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    );

    expect(getSorobanAuthAddressFromAuthEntrySafe(entry)).toBeNull();
  });

  it('returns null when address conversion fails', () => {
    const entry = {
      credentials: {
        type: 'sorobanCredentialsAddress',
        address: { address: {} },
      },
    } as unknown as xdr.SorobanAuthorizationEntry;

    expect(getSorobanAuthAddressFromAuthEntrySafe(entry)).toBeNull();
  });
});

describe('isContractIdPreimageAddress', () => {
  it('narrows fromAddress preimages', () => {
    const fromAddress = buildContractIdPreimageFromAddress(accountAddress);
    const fromAsset = xdr.ContractIdPreimage.contractIdPreimageFromAsset(
      Asset.native().toXDRObject(),
    );

    expect(isContractIdPreimageAddress(fromAddress)).toBe(true);
    expect(isContractIdPreimageAsset(fromAddress)).toBe(false);
    expect(isContractIdPreimageAddress(fromAsset)).toBe(false);
  });
});

describe('isContractIdPreimageAsset', () => {
  it('narrows fromAsset preimages', () => {
    const fromAsset = xdr.ContractIdPreimage.contractIdPreimageFromAsset(
      Asset.native().toXDRObject(),
    );

    expect(isContractIdPreimageAsset(fromAsset)).toBe(true);
    expect(isContractIdPreimageAddress(fromAsset)).toBe(false);
  });
});

describe('isContractExecutableWasm', () => {
  it('narrows wasm executables', () => {
    const wasm = xdr.ContractExecutable.contractExecutableWasm(
      bufferToUint8Array(new Uint8Array(32).fill(0x11)),
    );
    const stellarAsset =
      xdr.ContractExecutable.contractExecutableStellarAsset();

    expect(isContractExecutableWasm(wasm)).toBe(true);
    expect(isContractExecutableExternalRef(wasm)).toBe(false);
    expect(isContractExecutableWasm(stellarAsset)).toBe(false);
  });
});

describe('isContractExecutableExternalRef', () => {
  it('narrows CAP-85 externalRef executables', () => {
    const externalRef = buildExternalRefExecutable(contractId, 'beacon-v1');
    const stellarAsset =
      xdr.ContractExecutable.contractExecutableStellarAsset();

    expect(isContractExecutableExternalRef(externalRef)).toBe(true);
    expect(isContractExecutableWasm(externalRef)).toBe(false);
    expect(isContractExecutableExternalRef(stellarAsset)).toBe(false);
  });
});

describe('host function type guards', () => {
  const createContractV1 = xdr.HostFunction.hostFunctionTypeCreateContract(
    new xdr.CreateContractArgs({
      contractIdPreimage: buildContractIdPreimageFromAddress(accountAddress),
      executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
    }),
  );
  const createContractV2 = xdr.HostFunction.hostFunctionTypeCreateContractV2(
    new xdr.CreateContractArgsV2({
      contractIdPreimage: buildContractIdPreimageFromAddress(accountAddress),
      executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
      constructorArgs: [],
    }),
  );
  const uploadWasm = xdr.HostFunction.hostFunctionTypeUploadContractWasm(
    bufferToUint8Array(new Uint8Array([0x00, 0x61, 0x73, 0x6d])),
  );
  const invokeContract = xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(contractId).toScAddress(),
      functionName: 'transfer',
      args: [],
    }),
  );

  it('narrows CREATE_CONTRACT', () => {
    expect(isCreateContractV1(createContractV1)).toBe(true);
    expect(isCreateContractV1(createContractV2)).toBe(false);
    expect(isCreateContractV1(undefined)).toBe(false);
  });

  it('narrows CREATE_CONTRACT_V2', () => {
    expect(isCreateContractV2(createContractV2)).toBe(true);
    expect(isCreateContractV2(createContractV1)).toBe(false);
    expect(isCreateContractV2(undefined)).toBe(false);
  });

  it('narrows UPLOAD_CONTRACT_WASM', () => {
    expect(isUploadContractWasm(uploadWasm)).toBe(true);
    expect(isUploadContractWasm(invokeContract)).toBe(false);
    expect(isUploadContractWasm(undefined)).toBe(false);
  });

  it('narrows INVOKE_CONTRACT', () => {
    expect(isInvokeContract(invokeContract)).toBe(true);
    expect(isInvokeContract(uploadWasm)).toBe(false);
    expect(isInvokeContract(undefined)).toBe(false);
  });
});
