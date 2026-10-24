import {
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getTransactionMessageSizeLimit,
  getUtf8Codec,
} from '@solana/kit';

/**
 * Keep transaction signing behind the transaction confirmation and scan flow.
 * Reject plausible transaction messages that fit the version's transaction limit.
 *
 * @param bytes - Original bytes requested by the caller.
 * @throws If the bytes decode as a compiled Solana transaction message.
 */
export function assertIsNotTransactionMessage(bytes: Uint8Array): void {
  try {
    const decoded = getCompiledTransactionMessageDecoder().decode(bytes);
    // The codec also decodes impossible headers (for example, arbitrary binary
    // beginning with zero signers). Those cannot authorize a transaction.
    const { header, staticAccounts } = decoded;
    const feePayer = staticAccounts[0];
    if (
      !feePayer ||
      header.numSignerAccounts === 0 ||
      header.numSignerAccounts > staticAccounts.length ||
      header.numReadonlySignerAccounts >= header.numSignerAccounts ||
      header.numReadonlyNonSignerAccounts >
        staticAccounts.length - header.numSignerAccounts
    ) {
      return;
    }
    const sizeLimit = getTransactionMessageSizeLimit({
      version: decoded.version,
      feePayer: { address: feePayer },
      instructions: [],
    });
    // V1 puts the signature count in its message header. Legacy/v0 add a
    // shortU16 prefix; every count that fits the packet uses one prefix byte.
    const signaturePrefixSize = decoded.version === 1 ? 0 : 1;
    if (
      bytes.length + 64 * header.numSignerAccounts + signaturePrefixSize >
      sizeLimit
    ) {
      return;
    }
  } catch {
    return;
  }
  throw new Error('Cannot sign a transaction message using signMessage');
}

/**
 * Display the complete bytes when text decoding would hide or change content.
 *
 * @param bytes - Original message bytes.
 * @returns Readable UTF-8 text or an explicitly labelled Base64 representation.
 */
export function formatMessageForDisplay(bytes: Uint8Array): {
  message: string;
  isBinary: boolean;
  preview?: string;
} {
  const codec = getUtf8Codec();
  const message = codec.decode(bytes);
  const roundTrip = codec.encode(message);
  const isLossy =
    roundTrip.length !== bytes.length ||
    roundTrip.some((byte, index) => byte !== bytes[index]);
  const isBinary =
    isLossy || /[\p{Cc}\p{Cf}]/u.test(message.replace(/\n/gu, ''));
  // Keep legitimate emoji sequences and CRLF text readable without concealing
  // control/format characters. JSON escapes controls; escape format units too.
  const preview =
    isBinary && !isLossy
      ? JSON.stringify(message).replace(/\p{Cf}/gu, (character) =>
          character
            .split('')
            .map(
              (unit) =>
                `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`,
            )
            .join(''),
        )
      : undefined;
  return {
    message: isBinary ? getBase64Codec().decode(bytes) : message,
    isBinary,
    ...(preview ? { preview } : {}),
  };
}
