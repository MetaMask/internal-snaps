import { address, getAddressEncoder } from '@solana/kit';

import { validatePackPartnerMetadata } from './tokenMetadata';

const MINT = address('4NGjdY9LHWhbWGysoeXTgrQq8CLNm5SzZKuHfzerXByW');
const AUTHORITY = address('GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3');
const COLLECTION = address('CCryptWBYktukHDQ2vHGtVcmtjXxYzvw8XNVY64YN2Yf');
const encoder = getAddressEncoder();

// Borsh fields in the Token Metadata account prefix checked by both validators.
const metadataFields = {
  discriminator: [4],
  authority: Array.from(encoder.encode(AUTHORITY)),
  mint: Array.from(encoder.encode(MINT)),
  name: [0, 0, 0, 0],
  symbol: [0, 0, 0, 0],
  uri: [0, 0, 0, 0],
  sellerFee: [0, 0],
  creators: [0],
  flags: [0, 1],
  edition: [0],
  standard: [1, 0],
  collection: [1, 1, ...encoder.encode(COLLECTION)],
};

type MetadataField = keyof typeof metadataFields;

function metadataBytes(
  overrides: Partial<Record<MetadataField, readonly number[]>> = {},
): Uint8Array {
  return new Uint8Array(
    Object.values({ ...metadataFields, ...overrides }).flat(),
  );
}

function u32(value: number): number[] {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return Array.from(bytes);
}

const truncations: [string, number][] = [];
let fieldEnd = 0;
for (const [name, bytes] of Object.entries(metadataFields)) {
  fieldEnd += bytes.length;
  truncations.push([name, fieldEnd - 1]);
}

describe('validatePackPartnerMetadata', () => {
  it('requires the supplied verified collection instead of a mainnet default', () => {
    const collection = address('11111111111111111111111111111112');
    const bytes = metadataBytes({
      collection: [1, 1, ...encoder.encode(collection)],
    });
    expect(() =>
      validatePackPartnerMetadata(bytes, MINT, 0, collection),
    ).not.toThrow();
    expect(() =>
      validatePackPartnerMetadata(metadataBytes(), MINT, 0, collection),
    ).toThrow('Unexpected Pack Partner NFT collection.');
  });

  it.each([0, 4] as const)(
    'accepts the verified collection with standard %s',
    (standard) => {
      expect(() =>
        validatePackPartnerMetadata(
          metadataBytes({ standard: [1, standard] }),
          MINT,
          standard,
          COLLECTION,
        ),
      ).not.toThrow();
    },
  );

  it('accepts bounded strings, five creators and an edition nonce', () => {
    const bytes = metadataBytes({
      name: [...u32(256), ...new Uint8Array(256)],
      symbol: [...u32(64), ...new Uint8Array(64)],
      uri: [...u32(1024), ...new Uint8Array(1024)],
      creators: [1, ...u32(5), ...new Uint8Array(5 * 34)],
      flags: [1, 0],
      edition: [1, 255],
    });

    expect(() =>
      validatePackPartnerMetadata(bytes, MINT, 0, COLLECTION),
    ).not.toThrow();
  });

  it.each(truncations)('rejects truncated %s bytes', (_field, length) => {
    const truncated = metadataBytes().slice(0, length);

    expect(() =>
      validatePackPartnerMetadata(truncated, MINT, 0, COLLECTION),
    ).toThrow('Invalid Pack Partner NFT metadata length.');
  });

  it.each([
    ['name', 257],
    ['symbol', 65],
    ['uri', 1025],
    ['name', 0xffffffff],
  ] satisfies [MetadataField, number][])(
    'rejects an oversized %s length of %s',
    (field, length) => {
      const bytes = metadataBytes({ [field]: u32(length) });

      expect(() =>
        validatePackPartnerMetadata(bytes, MINT, 0, COLLECTION),
      ).toThrow('Invalid Pack Partner NFT metadata string.');
    },
  );

  it.each(['creators', 'edition', 'standard', 'collection'] as const)(
    'rejects a non-boolean option tag for %s',
    (field) => {
      const bytes = metadataBytes({ [field]: [2] });

      expect(() =>
        validatePackPartnerMetadata(bytes, MINT, 0, COLLECTION),
      ).toThrow('Invalid Pack Partner NFT metadata option.');
    },
  );

  it.each([6, 0xffffffff])('rejects a creator count of %s', (count) => {
    const bytes = metadataBytes({ creators: [1, ...u32(count)] });

    expect(() =>
      validatePackPartnerMetadata(bytes, MINT, 0, COLLECTION),
    ).toThrow('Invalid Pack Partner NFT creator count.');
  });

  it.each([
    [2, 1],
    [0, 2],
  ])('rejects metadata flags [%s, %s]', (primarySale, mutable) => {
    const bytes = metadataBytes({ flags: [primarySale, mutable] });

    expect(() =>
      validatePackPartnerMetadata(bytes, MINT, 0, COLLECTION),
    ).toThrow('Invalid Pack Partner NFT metadata flags.');
  });

  it('rejects a different account discriminator', () => {
    expect(() =>
      validatePackPartnerMetadata(
        metadataBytes({ discriminator: [5] }),
        MINT,
        0,
        COLLECTION,
      ),
    ).toThrow('Unexpected Pack Partner NFT metadata discriminator.');
  });

  it('rejects metadata for a different mint', () => {
    expect(() =>
      validatePackPartnerMetadata(metadataBytes(), AUTHORITY, 0, COLLECTION),
    ).toThrow('Unexpected Pack Partner NFT metadata mint.');
  });

  it.each([[0], [1, 4]])(
    'rejects absent or mismatched standard %j',
    (...tag) => {
      expect(() =>
        validatePackPartnerMetadata(
          metadataBytes({ standard: tag }),
          MINT,
          0,
          COLLECTION,
        ),
      ).toThrow('Unexpected Pack Partner NFT standard.');
    },
  );

  it.each([[0], [1, 0], [1, 2]])(
    'rejects absent or unverified collection %j',
    (...tag) => {
      expect(() =>
        validatePackPartnerMetadata(
          metadataBytes({ collection: tag }),
          MINT,
          0,
          COLLECTION,
        ),
      ).toThrow('Unverified Pack Partner NFT collection.');
    },
  );

  it('rejects a verified collection outside Pack Partner', () => {
    expect(() =>
      validatePackPartnerMetadata(
        metadataBytes({ collection: [1, 1, ...encoder.encode(AUTHORITY)] }),
        MINT,
        0,
        COLLECTION,
      ),
    ).toThrow('Unexpected Pack Partner NFT collection.');
  });
});
