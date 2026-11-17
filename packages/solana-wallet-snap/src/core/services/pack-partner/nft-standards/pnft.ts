import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
} from '@solana-program/token';
import {
  AccountRole,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit';
import type {
  Address,
  AccountMeta,
  Instruction,
  ReadonlyUint8Array,
} from '@solana/kit';

import {
  TOKEN_METADATA_PROGRAM_ADDRESS,
  AUTHORIZATION_RULES_PROGRAM_ADDRESS,
} from './programs';
import {
  validatePackPartnerMetadata,
  INSTRUCTIONS_SYSVAR_ADDRESS,
  TOKEN_METADATA_TRANSFER_V1_DATA,
} from './tokenMetadata';

export type PnftTransferAccounts = {
  recipient: Address;
  sourceToken: Address;
  destinationToken: Address;
  sourceTokenRecord: Address;
  destinationTokenRecord: Address;
  metadata: Address;
  edition: Address;
};

/**
 * Validate the observed Token Metadata programmable-NFT buyback.
 * Account order, transaction-wide privileges and all derived addresses are
 * checked before the user's signature can be added. Unreviewed TransferV1
 * variants (including authorization rule sets) remain unsupported.
 *
 * @param instruction - Decompiled instruction with transaction-wide privileges.
 * @param user - Selected Solana account.
 * @param assetAddress - Expected NFT mint from the buyback context.
 * @param provider - Authenticated Pack Partner signer for the selected network.
 * @param feePayer - Transaction fee payer already checked against the user and provider.
 * @param recipient - Required inventory from the selected network config.
 * @returns Addresses whose simulated before/after state must be checked.
 */
export async function validatePnftTransfer(
  instruction: Instruction,
  user: Address,
  assetAddress: Address,
  provider: Address,
  feePayer: Address,
  recipient: Address,
): Promise<PnftTransferAccounts> {
  const { accounts, data, programAddress } = instruction;
  if (
    programAddress !== TOKEN_METADATA_PROGRAM_ADDRESS ||
    data?.length !== TOKEN_METADATA_TRANSFER_V1_DATA.length ||
    TOKEN_METADATA_TRANSFER_V1_DATA.some(
      (byte, index) => data[index] !== byte,
    ) ||
    accounts?.length !== 17
  ) {
    throw new Error('Unsupported Pack Partner pNFT transfer.');
  }

  const [sourceToken] = await findAssociatedTokenPda({
    owner: user,
    mint: assetAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destinationToken] = await findAssociatedTokenPda({
    owner: recipient,
    mint: assetAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const addressEncoder = getAddressEncoder();
  const metadataSeeds = [
    'metadata',
    addressEncoder.encode(TOKEN_METADATA_PROGRAM_ADDRESS),
    addressEncoder.encode(assetAddress),
  ];
  const [metadata] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: metadataSeeds,
  });
  const [edition] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [...metadataSeeds, 'edition'],
  });
  const [sourceTokenRecord] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [
      ...metadataSeeds,
      'token_record',
      addressEncoder.encode(sourceToken),
    ],
  });
  const [destinationTokenRecord] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [
      ...metadataSeeds,
      'token_record',
      addressEncoder.encode(destinationToken),
    ],
  });

  // Decompiled instructions expose transaction-wide roles: the fee payer is
  // writable even when this instruction only requires its signing authority.
  const userRole =
    feePayer === user
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  const expectedAccounts: readonly AccountMeta[] = [
    { address: sourceToken, role: AccountRole.WRITABLE },
    { address: user, role: userRole },
    { address: destinationToken, role: AccountRole.WRITABLE },
    { address: recipient, role: AccountRole.READONLY },
    { address: assetAddress, role: AccountRole.READONLY },
    { address: metadata, role: AccountRole.WRITABLE },
    { address: edition, role: AccountRole.READONLY },
    { address: sourceTokenRecord, role: AccountRole.WRITABLE },
    { address: destinationTokenRecord, role: AccountRole.WRITABLE },
    { address: user, role: userRole },
    { address: provider, role: AccountRole.WRITABLE_SIGNER },
    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: INSTRUCTIONS_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    {
      address: AUTHORIZATION_RULES_PROGRAM_ADDRESS,
      role: AccountRole.READONLY,
    },
    // Token Metadata uses its program address for the absent rule-set account.
    { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  ];
  if (
    expectedAccounts.some(
      (expected, index) =>
        accounts[index]?.address !== expected.address ||
        accounts[index]?.role !== expected.role,
    )
  ) {
    throw new Error('Unexpected Pack Partner pNFT transfer accounts.');
  }

  return {
    recipient,
    sourceToken,
    destinationToken,
    sourceTokenRecord,
    destinationTokenRecord,
    metadata,
    edition,
  };
}

/**
 * Require a programmable NFT from the verified Pack Partner collection.
 * The caller separately checks the PDA and program owner.
 *
 * @param data - Raw Token Metadata account bytes from RPC.
 * @param expectedMint - Mint selected for the buyback.
 * @param expectedCollection - Required collection from the selected network config.
 */
export function validatePnftMetadata(
  data: ReadonlyUint8Array,
  expectedMint: Address,
  expectedCollection: Address,
): void {
  validatePackPartnerMetadata(data, expectedMint, 4, expectedCollection);
}
