import { address, getCompiledTransactionMessageEncoder } from '@solana/kit';

import {
  assertIsNotTransactionMessage,
  formatMessageForDisplay,
} from './signMessage';

describe('message signing safety', () => {
  it('rejects a compiled v1 transaction message supported by the installed codec', () => {
    const bytes = getCompiledTransactionMessageEncoder().encode({
      version: 1,
      header: {
        numSignerAccounts: 1,
        numReadonlySignerAccounts: 0,
        numReadonlyNonSignerAccounts: 0,
      },
      staticAccounts: [address('11111111111111111111111111111111')],
      lifetimeToken: '11111111111111111111111111111111',
      configMask: 0,
      configValues: [],
      numStaticAccounts: 1,
      numInstructions: 0,
      instructionHeaders: [],
      instructionPayloads: [],
    });
    expect(() => assertIsNotTransactionMessage(new Uint8Array(bytes))).toThrow(
      'Cannot sign a transaction message using signMessage',
    );
    // V1 has a larger packet limit than legacy/v0. Plausible messages above
    // 1232 bytes still require the transaction signing flow.
    expect(() =>
      assertIsNotTransactionMessage(
        new Uint8Array([...bytes, ...new Uint8Array(2000)]),
      ),
    ).toThrow('Cannot sign a transaction message using signMessage');
    expect(() =>
      assertIsNotTransactionMessage(
        new Uint8Array([...bytes, ...new Uint8Array(5000)]),
      ),
    ).not.toThrow();
  });

  it.each(['legacy', 0] as const)(
    'rejects a compiled %s transaction message, including a trailing payload',
    (version) => {
      const bytes = getCompiledTransactionMessageEncoder().encode({
        version,
        header: {
          numSignerAccounts: 1,
          numReadonlySignerAccounts: 0,
          numReadonlyNonSignerAccounts: 0,
        },
        staticAccounts: [address('11111111111111111111111111111111')],
        lifetimeToken: '11111111111111111111111111111111',
        instructions: [],
      });
      expect(() =>
        assertIsNotTransactionMessage(new Uint8Array(bytes)),
      ).toThrow('Cannot sign a transaction message using signMessage');
      expect(() =>
        assertIsNotTransactionMessage(new Uint8Array([...bytes, 42])),
      ).toThrow('Cannot sign a transaction message using signMessage');
    },
  );

  it.each([
    Buffer.from('Hello, 世界 👋\nSecond line', 'utf8'),
    Buffer.from([0, 65, 0, 66, 0]),
    Buffer.from([0xff, 0xfe, 0x80, 0xc3, 0x28]),
    Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  ])('allows non-transaction text and binary data', (bytes) => {
    expect(() => assertIsNotTransactionMessage(bytes)).not.toThrow();
  });

  it.each([
    Buffer.from([65, 0, 66]),
    Buffer.from([65, 66, 0]),
    Buffer.from([0xef, 0xbb, 0xbf, 65]),
    Buffer.from([0xff, 0xfe, 0x80]),
  ])(
    'shows hidden or lossy content as the complete Base64 payload',
    (bytes) => {
      expect(formatMessageForDisplay(bytes)).toStrictEqual({
        message: bytes.toString('base64'),
        isBinary: true,
      });
    },
  );

  it.each(['I, the', '10 i', '1. T'])(
    'allows large text starting with %s that cannot fit a transaction',
    (prefix) => {
      expect(() =>
        assertIsNotTransactionMessage(Buffer.from(prefix + 'a'.repeat(30000))),
      ).not.toThrow();
    },
  );

  it('shows a readable escaped preview alongside full bytes for emoji and CRLF', () => {
    const message = 'Welcome 👩‍💻\r\nSign to log in';
    const bytes = Buffer.from(message);
    expect(formatMessageForDisplay(bytes)).toStrictEqual({
      message: bytes.toString('base64'),
      isBinary: true,
      preview: '"Welcome 👩\\u200d💻\\r\\nSign to log in"',
    });
  });

  it('keeps valid Unicode and multiline messages readable', () => {
    const message = 'Hello, 世界 👋\nSecond line';
    expect(formatMessageForDisplay(Buffer.from(message))).toStrictEqual({
      message,
      isBinary: false,
    });
  });
});
