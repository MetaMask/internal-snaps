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

import { TOKEN_METADATA_PROGRAM_ADDRESS } from './programs';
import {
  validatePackPartnerMetadata,
  INSTRUCTIONS_SYSVAR_ADDRESS,
  TOKEN_METADATA_TRANSFER_V1_DATA,
} from './tokenMetadata';

export type NftTransferAccounts = {
  recipient: Address;
  sourceToken: Address;
  destinationToken: Address;
  metadata: Address;
};

/**
 * Validate the observed ordinary Token Metadata NonFungible buyback transfer.
 * The inventory recipient may vary by machine; it is bound by Pack Partner's
 * verified presignature and must receive the selected mint in its canonical ATA.
 * No pNFT token records, rule set, or additional accounts are accepted.
 *
 * @param instruction - Decompiled and presigned TransferV1 instruction.
 * @param user - Selected Solana account.
 * @param assetAddress - Selected NFT mint.
 * @param provider - Authenticated Pack Partner signer for the selected network.
 * @param feePayer - Transaction fee payer already checked against the user and provider.
 * @returns The accounts to verify against pre- and post-simulation state.
 */
export async function validateNftTransfer(
  instruction: Instruction,
  user: Address,
  assetAddress: Address,
  provider: Address,
  feePayer: Address,
): Promise<NftTransferAccounts> {
  const { accounts, data, programAddress } = instruction;
  if (
    programAddress !== TOKEN_METADATA_PROGRAM_ADDRESS ||
    data?.length !== TOKEN_METADATA_TRANSFER_V1_DATA.length ||
    TOKEN_METADATA_TRANSFER_V1_DATA.some(
      (byte, index) => data[index] !== byte,
    ) ||
    accounts?.length !== 17
  ) {
    throw new Error('Unsupported Pack Partner NFT transfer.');
  }
  const recipient = accounts[3]?.address;
  if (!recipient || recipient === user) {
    throw new Error('Unexpected Pack Partner NFT recipient.');
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
  const [metadata] = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [
      'metadata',
      addressEncoder.encode(TOKEN_METADATA_PROGRAM_ADDRESS),
      addressEncoder.encode(assetAddress),
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
    { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: user, role: userRole },
    { address: provider, role: AccountRole.WRITABLE_SIGNER },
    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: INSTRUCTIONS_SYSVAR_ADDRESS, role: AccountRole.READONLY },
    { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: TOKEN_METADATA_PROGRAM_ADDRESS, role: AccountRole.READONLY },
  ];
  if (
    expectedAccounts.some(
      (expected, index) =>
        accounts[index]?.address !== expected.address ||
        accounts[index]?.role !== expected.role,
    )
  ) {
    throw new Error('Unexpected Pack Partner NFT transfer accounts.');
  }
  return { recipient, sourceToken, destinationToken, metadata };
}

/**
 * Require a classic NFT from the verified Pack Partner collection.
 * The caller separately checks the PDA and program owner.
 *
 * @param data - Raw Token Metadata account bytes from RPC.
 * @param expectedMint - Mint selected for the buyback.
 * @param expectedCollection - Required collection from the selected network config.
 */
export function validateNftMetadata(
  data: ReadonlyUint8Array,
  expectedMint: Address,
  expectedCollection: Address,
): void {
  validatePackPartnerMetadata(data, expectedMint, 0, expectedCollection);
}
