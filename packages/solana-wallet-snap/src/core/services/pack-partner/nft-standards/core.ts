import {
  AccountRole,
  getAddressDecoder,
  getStructDecoder,
  getU8Decoder,
} from '@solana/kit';
import type {
  AccountMeta,
  Address,
  Instruction,
  ReadonlyUint8Array,
} from '@solana/kit';

import type { PackPartnerCorePolicy } from '../constants';
import { CORE_PROGRAM_ADDRESS } from './programs';

// AssetV1 and Collection authority layouts from the Metaplex Core SDK:
// https://github.com/metaplex-foundation/mpl-core/blob/main/clients/js/src/generated/accounts/assetV1.ts
// https://github.com/metaplex-foundation/mpl-core/blob/main/clients/js/src/generated/types/baseUpdateAuthority.ts
// Decode only the fixed ownership prefix. Metadata and plugin records follow it.
const assetOwnershipDecoder = getStructDecoder([
  ['key', getU8Decoder()],
  ['owner', getAddressDecoder()],
  ['updateAuthority', getU8Decoder()],
  ['collection', getAddressDecoder()],
]);

/**
 * Validate the narrowly supported Metaplex Core buyback transfer.
 *
 * Compression, optional programs, and additional plugin accounts are rejected.
 * This prevents the user's signature from authorizing a broader Core operation.
 *
 * @see https://github.com/metaplex-foundation/mpl-core/blob/main/clients/js/src/generated/instructions/transferV1.ts
 * @param instruction - Decompiled instruction with transaction-wide privileges.
 * @param user - Address of the account signing the buyback.
 * @param assetAddress - Expected Core asset address from the confirmed buyback.
 * @param provider - Authenticated Pack Partner signer for the selected network.
 * @param feePayer - Transaction fee payer already checked against the user and provider.
 * @param policy - Required collection and inventory from the selected network config.
 * @returns The verified inventory recipient, for checking simulated ownership.
 */
export function validateCoreTransfer(
  instruction: Instruction,
  user: Address,
  assetAddress: Address,
  provider: Address,
  feePayer: Address,
  policy: PackPartnerCorePolicy,
): Address {
  const { accounts, data, programAddress } = instruction;
  if (
    programAddress !== CORE_PROGRAM_ADDRESS ||
    data?.length !== 2 ||
    data[0] !== 14 ||
    data[1] !== 0 ||
    accounts?.length !== 7
  ) {
    throw new Error('Unsupported Pack Partner Core transfer.');
  }

  const recipient = accounts[4]?.address;
  if (!recipient || !policy.recipients.includes(recipient)) {
    throw new Error('Unexpected Pack Partner NFT recipient.');
  }

  // Decompiled instructions expose transaction-wide roles: the fee payer is
  // writable even when this instruction only requires its signing authority.
  const userRole =
    feePayer === user
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  const expectedAccounts: readonly AccountMeta[] = [
    { address: assetAddress, role: AccountRole.WRITABLE },
    { address: policy.collection, role: AccountRole.READONLY },
    { address: provider, role: AccountRole.WRITABLE_SIGNER },
    { address: user, role: userRole },
    { address: recipient, role: AccountRole.READONLY },
    // Core uses its own program address as the omitted optional account sentinel.
    { address: CORE_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: CORE_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  ];
  if (
    expectedAccounts.some(
      (expected, index) =>
        accounts[index]?.address !== expected.address ||
        accounts[index]?.role !== expected.role,
    )
  ) {
    throw new Error('Unexpected Pack Partner Core transfer accounts.');
  }

  return recipient;
}

/**
 * Verify the owner and verified collection of an uncompressed Core asset.
 *
 * The caller must independently verify the RPC account is owned by Core. The
 * same decoder is used on pre- and post-simulation data, with the expected owner
 * changed to the validated transfer recipient for the latter.
 *
 * @param data - Account bytes from the trusted RPC.
 * @param expectedOwner - The user before transfer or inventory after transfer.
 * @param expectedCollection - Required collection from the selected network config.
 */
export function validateCoreAsset(
  data: ReadonlyUint8Array,
  expectedOwner: Address,
  expectedCollection: Address,
): void {
  const asset = assetOwnershipDecoder.decode(data);
  if (
    asset.key !== 1 ||
    asset.owner !== expectedOwner ||
    asset.updateAuthority !== 2 ||
    asset.collection !== expectedCollection
  ) {
    throw new Error('Unexpected Pack Partner NFT ownership or collection.');
  }
}
