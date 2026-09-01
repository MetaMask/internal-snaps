/* eslint-disable jest/require-to-throw-message */
import { assert, is } from '@metamask/superstruct';

import { UuidStruct } from './uuidStruct';

describe('UuidStruct', () => {
  it('accepts UUID v4 strings', () => {
    const validUuids = [
      'c747acb9-1b2b-4352-b9da-3d658fcc3cc7',
      '2507a426-ac26-43c4-a82a-250f5d999398',
      '52d181f4-d050-4971-b448-17c15107fa3b',
      '52d181f4-d050-4971-b448-17c15107fa3b'.toUpperCase(),
    ];

    validUuids.forEach((uuid) => {
      expect(() => assert(uuid, UuidStruct)).not.toThrow();
      expect(is(uuid, UuidStruct)).toBe(true);
    });
  });

  it('rejects non-UUID and non-v4 values', () => {
    const invalidUuids = [
      '',
      'not-a-uuid',
      '12345678-1234-4234-8234-1234',
      '12345678-1234-4234-8234-1234567890123',
      // UUID v1 (version nibble is 1)
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      // Nil UUID
      '00000000-0000-0000-0000-000000000000',
    ];

    invalidUuids.forEach((uuid) => {
      expect(() => assert(uuid, UuidStruct)).toThrow();
      expect(is(uuid, UuidStruct)).toBe(false);
    });
  });
});
