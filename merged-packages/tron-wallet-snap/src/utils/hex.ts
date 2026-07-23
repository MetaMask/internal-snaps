/**
 * Converts a hex-encoded string to UTF-8.
 *
 * @param value - Hex string (with or without 0x prefix)
 * @returns Decoded UTF-8 string
 */
export function hexToString(value: string): string {
  const cleanValue = value.startsWith('0x') ? value.slice(2) : value;

  if (cleanValue.length === 0) {
    return '';
  }

  if (cleanValue.length % 2 !== 0) {
    throw new Error('Invalid hex string: odd length');
  }

  const bytes = new Uint8Array(cleanValue.length / 2);
  for (let index = 0; index < cleanValue.length; index += 2) {
    const byte = parseInt(cleanValue.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex string: contains non-hex characters');
    }
    bytes[index / 2] = byte;
  }

  return new TextDecoder().decode(bytes);
}
