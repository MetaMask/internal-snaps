import { create, number, string } from '@metamask/superstruct';

import { UrlStruct } from '../urlStruct/urlStruct';
import {
  commaSeparatedListOf,
  emptyToUndefined,
  parseIntegerStruct,
  parseFloatStruct,
} from './envStructs';

describe('emptyToUndefined', () => {
  it('passes strings through with a plain string item struct', () => {
    const struct = emptyToUndefined(string());

    expect(create('https://example.com', struct)).toBe('https://example.com');
  });

  it('accepts undefined', () => {
    const struct = emptyToUndefined(string());

    expect(create(undefined, struct)).toBeUndefined();
  });

  it('coerces empty strings to undefined', () => {
    const struct = emptyToUndefined(string());

    expect(create('', struct)).toBeUndefined();
  });

  it('passes valid values through the item struct', () => {
    const struct = emptyToUndefined(UrlStruct);

    expect(create('https://example.com', struct)).toBe('https://example.com');
  });

  it('rejects values the item struct rejects', () => {
    const struct = emptyToUndefined(UrlStruct);

    expect(() => create('not-a-url', struct)).toThrow(
      'Invalid URL format: Invalid URL',
    );
  });
});

describe('commaSeparatedListOf', () => {
  it('splits a comma-separated string into items', () => {
    const struct = commaSeparatedListOf(string());

    expect(create('1,2,3', struct)).toStrictEqual(['1', '2', '3']);
  });

  it('rejects items that do not match the item struct', () => {
    const struct = commaSeparatedListOf(number());

    expect(() => create('1,2,three', struct)).toThrow(
      'At path: 0 -- Expected a number',
    );
  });

  it('rejects non-string input', () => {
    const struct = commaSeparatedListOf(number());

    expect(() => create(42, struct)).toThrow('Expected an array value');
  });
});

describe('parseIntegerStruct', () => {
  it('parses an integer from a string', () => {
    const struct = parseIntegerStruct(0, 10);

    expect(create('42', struct)).toBe(42);
  });

  it('defaults to the default value when unset or empty', () => {
    const struct = parseIntegerStruct(0, 10);

    expect(create(undefined, struct)).toBe(10);
    expect(create('', struct)).toBe(10);
  });

  it('rejects values below the minimum', () => {
    const struct = parseIntegerStruct(10, 10);

    expect(() => create('5', struct)).toThrow(
      'Expected a number greater than or equal to 10',
    );
  });

  it('rejects non-numeric strings', () => {
    const struct = parseIntegerStruct(0, 10);

    expect(() => create('not-a-number', struct)).toThrow(
      'Expected a number, but received: NaN',
    );
  });
});

describe('parseFloatStruct', () => {
  it('parses a float from a string', () => {
    const struct = parseFloatStruct(0, 10);

    expect(create('4.2', struct)).toBe(4.2);
  });

  it('defaults to the default value when unset or empty', () => {
    const struct = parseFloatStruct(0, 10);

    expect(create(undefined, struct)).toBe(10);
    expect(create('', struct)).toBe(10);
  });

  it('rejects values below the minimum', () => {
    const struct = parseFloatStruct(10, 10);

    expect(() => create('5.5', struct)).toThrow(
      'Expected a number greater than or equal to 10',
    );
  });

  it('rejects non-numeric strings', () => {
    const struct = parseFloatStruct(0, 10);

    expect(() => create('not-a-number', struct)).toThrow(
      'Expected a number, but received: NaN',
    );
  });
});
