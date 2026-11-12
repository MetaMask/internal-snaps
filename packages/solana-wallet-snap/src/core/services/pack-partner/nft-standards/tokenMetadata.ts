import { address, getAddressDecoder } from '@solana/kit';
import type { Address, ReadonlyUint8Array } from '@solana/kit';

export const INSTRUCTIONS_SYSVAR_ADDRESS = address(
  'Sysvar1nstructions1111111111111111111111111',
);
// TransferV1 of exactly one NFT, without authorization data (classic and pNFT).
export const TOKEN_METADATA_TRANSFER_V1_DATA = [
  49, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
];

/**
 * Validate the bounded security-relevant prefix common to classic NFT and
 * pNFT Token Metadata accounts. Transfer instruction and token-account shapes
 * remain separate for the two standards.
 *
 * @param data - Raw Token Metadata account bytes from RPC.
 * @param expectedMint - Mint selected for the buyback.
 * @param expectedStandard - Metaplex 0 (NonFungible) or 4 (ProgrammableNonFungible).
 * @param expectedCollection - Required collection from the selected network config.
 */
export function validatePackPartnerMetadata(
  data: ReadonlyUint8Array,
  expectedMint: Address,
  expectedStandard: 0 | 4,
  expectedCollection: Address,
): void {
  let offset = 0;
  const take = (length: number): ReadonlyUint8Array => {
    if (length < 0 || length > data.length - offset) {
      throw new Error('Invalid Pack Partner NFT metadata length.');
    }
    const bytes = data.slice(offset, offset + length);
    offset += length;
    return bytes;
  };
  const readU8 = (): number => take(1)[0] as number;
  const readU32 = (): number => {
    const bytes = take(4);
    return (
      (bytes[0] as number) +
      (bytes[1] as number) * 256 +
      (bytes[2] as number) * 65536 +
      (bytes[3] as number) * 16777216
    );
  };
  const skipString = (maxLength: number): void => {
    const length = readU32();
    if (length > maxLength) {
      throw new Error('Invalid Pack Partner NFT metadata string.');
    }
    take(length);
  };
  const readOption = (): boolean => {
    const tag = readU8();
    if (tag !== 0 && tag !== 1) {
      throw new Error('Invalid Pack Partner NFT metadata option.');
    }
    return tag === 1;
  };
  const readAddress = (): Address => getAddressDecoder().decode(take(32));

  if (readU8() !== 4) {
    throw new Error('Unexpected Pack Partner NFT metadata discriminator.');
  }
  readAddress(); // Update authority alone cannot authorize a buyback.
  if (readAddress() !== expectedMint) {
    throw new Error('Unexpected Pack Partner NFT metadata mint.');
  }
  skipString(256);
  skipString(64);
  skipString(1024);
  take(2); // Seller fee basis points.
  if (readOption()) {
    const creators = readU32();
    if (creators > 5) {
      throw new Error('Invalid Pack Partner NFT creator count.');
    }
    take(creators * 34);
  }
  const primarySaleHappened = readU8();
  const isMutable = readU8();
  if (
    (primarySaleHappened !== 0 && primarySaleHappened !== 1) ||
    (isMutable !== 0 && isMutable !== 1)
  ) {
    throw new Error('Invalid Pack Partner NFT metadata flags.');
  }
  if (readOption()) {
    readU8(); // Edition nonce.
  }
  if (!readOption() || readU8() !== expectedStandard) {
    throw new Error('Unexpected Pack Partner NFT standard.');
  }
  if (!readOption() || readU8() !== 1) {
    throw new Error('Unverified Pack Partner NFT collection.');
  }
  if (readAddress() !== expectedCollection) {
    throw new Error('Unexpected Pack Partner NFT collection.');
  }
}
