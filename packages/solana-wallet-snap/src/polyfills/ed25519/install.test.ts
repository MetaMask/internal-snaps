import { bytesToHex, hexToBytes } from '@metamask/utils';

import { install } from '.';

const ED25519_ALGORITHM = { name: 'Ed25519' } as const;

const ED25519_PKCS8_HEADER = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04,
  0x22, 0x04, 0x20,
]);

const PRIVATE_KEY_BYTES = new Uint8Array(32).fill(7);
const PKCS8_KEY = new Uint8Array([
  ...ED25519_PKCS8_HEADER,
  ...PRIVATE_KEY_BYTES,
]);

const PUBLIC_KEY_HEX =
  '0xea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c';
const MESSAGE = new TextEncoder().encode('hello solana');
const SIGNATURE_HEX =
  '0x9091b5d70d7c5b015eef7e8133db6c8aa5460f416024e4fac7bde7f1970a71f8257e2f6b6801f3f659817e6e9fbe013f624b72bd62277a42e4ca309737a0b301';

const SUBTLE_METHODS = [
  'generateKey',
  'exportKey',
  'sign',
  'verify',
  'importKey',
] as const;

function restoreSubtle(): void {
  for (const method of SUBTLE_METHODS) {
    Reflect.deleteProperty(globalThis.crypto.subtle, method);
  }
}

function assertCryptoKeyPair(value: CryptoKeyPair | CryptoKey): CryptoKeyPair {
  if (value instanceof globalThis.CryptoKey) {
    throw new Error('Expected a key pair');
  }

  return value;
}

describe('install', () => {
  afterEach(() => {
    restoreSubtle();
  });

  it('uses native Ed25519 when the runtime supports it', async () => {
    install();

    const privateKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      PKCS8_KEY,
      ED25519_ALGORITHM,
      true,
      ['sign'],
    );

    expect(privateKey).toBeInstanceOf(globalThis.CryptoKey);

    const signature = await globalThis.crypto.subtle.sign(
      ED25519_ALGORITHM,
      privateKey,
      MESSAGE,
    );

    expect(bytesToHex(new Uint8Array(signature))).toBe(SIGNATURE_HEX);

    expect(
      new Uint8Array(
        await globalThis.crypto.subtle.exportKey('pkcs8', privateKey),
      ),
    ).toStrictEqual(PKCS8_KEY);

    const keyPair = await globalThis.crypto.subtle.generateKey(
      ED25519_ALGORITHM,
      true,
      ['sign', 'verify'],
    );

    expect(keyPair).toHaveProperty('privateKey');
  });

  it('falls back to the polyfill when native Ed25519 is unavailable', async () => {
    Object.defineProperty(globalThis.crypto.subtle, 'importKey', {
      configurable: true,
      writable: true,
      value: async () => {
        throw new Error('Unsupported algorithm');
      },
    });

    install();

    const privateKey = await globalThis.crypto.subtle.importKey(
      'pkcs8',
      PKCS8_KEY,
      ED25519_ALGORITHM,
      false,
      ['sign'],
    );

    expect(privateKey).not.toBeInstanceOf(globalThis.CryptoKey);

    const signature = await globalThis.crypto.subtle.sign(
      ED25519_ALGORITHM,
      privateKey,
      MESSAGE,
    );

    expect(bytesToHex(new Uint8Array(signature))).toBe(SIGNATURE_HEX);

    const publicKey = await globalThis.crypto.subtle.importKey(
      'raw',
      hexToBytes(PUBLIC_KEY_HEX),
      ED25519_ALGORITHM,
      true,
      ['verify'],
    );

    const rawPublicKey = await globalThis.crypto.subtle.exportKey(
      'raw',
      publicKey,
    );

    expect(new Uint8Array(rawPublicKey)).toStrictEqual(
      hexToBytes(PUBLIC_KEY_HEX),
    );

    expect(
      await globalThis.crypto.subtle.verify(
        ED25519_ALGORITHM,
        publicKey,
        new Uint8Array(signature),
        MESSAGE,
      ),
    ).toBe(true);

    const keyPair = assertCryptoKeyPair(
      await globalThis.crypto.subtle.generateKey(ED25519_ALGORITHM, true, [
        'sign',
        'verify',
      ]),
    );

    expect(keyPair).not.toBeInstanceOf(globalThis.CryptoKey);

    const generatedMessage = new TextEncoder().encode('generated key');
    const generatedSignature = await globalThis.crypto.subtle.sign(
      ED25519_ALGORITHM,
      keyPair.privateKey,
      generatedMessage,
    );

    expect(
      await globalThis.crypto.subtle.verify(
        ED25519_ALGORITHM,
        keyPair.publicKey,
        generatedSignature,
        generatedMessage,
      ),
    ).toBe(true);
  });

  it('leaves non-Ed25519 algorithms on the native implementation', async () => {
    install();

    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      new Uint8Array(16),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );

    expect(key).toBeInstanceOf(globalThis.CryptoKey);
  });
});
