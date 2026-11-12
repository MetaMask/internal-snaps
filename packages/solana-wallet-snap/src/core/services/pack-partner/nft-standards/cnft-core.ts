import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  AccountRole,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Decoder,
  getU64Encoder,
} from '@solana/kit';
import type {
  AccountMeta,
  Address,
  Instruction,
  ReadonlyUint8Array,
} from '@solana/kit';

import {
  BUBBLEGUM_PROGRAM_ADDRESS,
  COMPRESSION_PROGRAM_ADDRESS,
  NOOP_PROGRAM_ADDRESS,
} from './programs';

// Bubblegum charges this in addition to the Solana network fee. The reviewed
// instruction always charges the authenticated provider, never the user's SOL.
// https://github.com/metaplex-foundation/mpl-bubblegum/blob/main/programs/bubblegum/program/src/state/collect.rs
export const CNFT_CORE_TRANSFER_FEE = 6_000n;
const TRANSFER_V2_DISCRIMINATOR = [119, 40, 6, 235, 234, 221, 248, 49];

/**
 * Read the nonce only after checking the complete canonical transferV2 data.
 *
 * Asset-data hash and flags are Borsh options. Only absent/zero flags are allowed:
 * frozen, nontransferable, and future flag semantics require a fresh review.
 * The root, metadata hashes and index are subsequently validated by simulation.
 *
 * @param data - Raw instruction data from the authenticated presigned message.
 * @returns The tree-scoped asset nonce.
 */
function readTransferNonce(data: ReadonlyUint8Array): bigint {
  if (
    data.length < 118 ||
    TRANSFER_V2_DISCRIMINATOR.some((byte, index) => data[index] !== byte)
  ) {
    throw new Error('Unsupported Pack Partner compressed transfer data.');
  }
  const assetDataTag = data[104];
  if (assetDataTag !== 0 && assetDataTag !== 1) {
    throw new Error('Noncanonical Pack Partner asset data option.');
  }
  const flagsOffset = 105 + assetDataTag * 32;
  const flagsTag = data[flagsOffset];
  if (
    (flagsTag !== 0 && flagsTag !== 1) ||
    (flagsTag === 1 && data[flagsOffset + 1] !== 0)
  ) {
    throw new Error('Unsupported Pack Partner compressed asset flags.');
  }
  const nonceOffset = flagsOffset + 1 + flagsTag;
  // Exactly u64 nonce + u32 index must follow, with no trailing instructions.
  if (data.length !== nonceOffset + 12) {
    throw new Error('Noncanonical Pack Partner compressed transfer length.');
  }
  return getU64Decoder().decode(data.slice(nonceOffset, nonceOffset + 8));
}

/**
 * Validate the narrow Bubblegum V2 Core-collection buyback transfer profile.
 *
 * The caller must first authenticate the provider's signature over the complete
 * message, then simulate it successfully before signing. This helper binds the
 * expected asset ID to its tree and nonce; canonical Bubblegum simulation must
 * verify the original owner, collection, hashes, index and Merkle proof. It does
 * not verify the proof off chain. The collection is pinned to the observed
 * Pack Partner collection. The provider's presignature authenticates the
 * inventory recipient, rather than deriving it from display metadata.
 *
 * @see https://github.com/metaplex-foundation/mpl-bubblegum/blob/main/clients/js/src/generated/instructions/transferV2.ts
 * @see https://github.com/metaplex-foundation/mpl-bubblegum/blob/main/clients/js/src/leafAssetId.ts
 * @param instruction - Decompiled instruction with transaction-wide privileges.
 * @param user - Required owner and signing authority of the requested cNFT.
 * @param assetId - Exact cNFT asset ID confirmed in the buyback intent.
 * @param provider - Authenticated Pack Partner presigner for this network.
 * @param feePayer - Validated network fee payer, either user or provider.
 * @param expectedCollection - Required collection from the selected network config.
 * @returns Accounts that require additional simulation snapshot checks.
 */
export async function validateCnftCoreTransfer(
  instruction: Instruction,
  user: Address,
  assetId: Address,
  provider: Address,
  feePayer: Address,
  expectedCollection: Address,
): Promise<{
  tree: Address;
  treeConfig: Address;
  collection: Address;
}> {
  const { accounts, data, programAddress } = instruction;
  if (
    programAddress !== BUBBLEGUM_PROGRAM_ADDRESS ||
    !data ||
    !accounts ||
    accounts.length < 11 ||
    (feePayer !== user && feePayer !== provider)
  ) {
    throw new Error('Unsupported Pack Partner compressed transfer.');
  }
  const nonce = readTransferNonce(data);
  const tree = accounts[6]?.address;
  const collection = accounts[7]?.address;
  const recipient = accounts[5]?.address;
  if (!tree || !collection || !recipient) {
    throw new Error('Missing Pack Partner compressed transfer accounts.');
  }
  const treeBytes = getAddressEncoder().encode(tree);
  const [treeConfig] = await getProgramDerivedAddress({
    programAddress: BUBBLEGUM_PROGRAM_ADDRESS,
    seeds: [treeBytes],
  });
  const [derivedAssetId] = await getProgramDerivedAddress({
    programAddress: BUBBLEGUM_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode('asset'),
      treeBytes,
      getU64Encoder().encode(nonce),
    ],
  });
  const criticalAccounts: readonly Address[] = [
    user,
    provider,
    tree,
    treeConfig,
    BUBBLEGUM_PROGRAM_ADDRESS,
    COMPRESSION_PROGRAM_ADDRESS,
    NOOP_PROGRAM_ADDRESS,
    SYSTEM_PROGRAM_ADDRESS,
  ];
  if (
    derivedAssetId !== assetId ||
    collection !== expectedCollection ||
    criticalAccounts.includes(collection) ||
    criticalAccounts.includes(recipient) ||
    recipient === collection
  ) {
    throw new Error('Unexpected Pack Partner compressed asset or recipient.');
  }
  const userRole =
    feePayer === user
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  const delegate =
    accounts[4]?.address === BUBBLEGUM_PROGRAM_ADDRESS
      ? { address: BUBBLEGUM_PROGRAM_ADDRESS, role: AccountRole.READONLY }
      : { address: user, role: userRole };
  const expectedAccounts: readonly AccountMeta[] = [
    { address: treeConfig, role: AccountRole.WRITABLE },
    { address: provider, role: AccountRole.WRITABLE_SIGNER },
    { address: user, role: userRole },
    { address: user, role: userRole },
    delegate,
    { address: recipient, role: AccountRole.READONLY },
    { address: tree, role: AccountRole.WRITABLE },
    { address: collection, role: AccountRole.READONLY },
    { address: NOOP_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: COMPRESSION_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  ];
  if (
    expectedAccounts.some(
      (expected, index) =>
        accounts[index]?.address !== expected.address ||
        accounts[index]?.role !== expected.role,
    ) ||
    accounts.slice(11).some(({ role }) => role !== AccountRole.READONLY)
  ) {
    throw new Error('Unexpected Pack Partner compressed transfer accounts.');
  }
  return { tree, treeConfig, collection };
}
