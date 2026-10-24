import {
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getUtf8Codec,
} from '@solana/kit';

/**
 * Keep transaction signing behind the transaction confirmation and scan flow.
 * Reject any decodable transaction prefix, including messages with trailing data.
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
    if (
      header.numSignerAccounts === 0 ||
      header.numSignerAccounts > staticAccounts.length ||
      header.numReadonlySignerAccounts >= header.numSignerAccounts ||
      header.numReadonlyNonSignerAccounts >
        staticAccounts.length - header.numSignerAccounts
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
} {
  const codec = getUtf8Codec();
  const message = codec.decode(bytes);
  const roundTrip = codec.encode(message);
  const isBinary =
    roundTrip.length !== bytes.length ||
    roundTrip.some((byte, index) => byte !== bytes[index]) ||
    /[\p{Cc}\p{Cf}]/u.test(message.replace(/\n/gu, ''));
  return {
    message: isBinary ? getBase64Codec().decode(bytes) : message,
    isBinary,
  };
}
