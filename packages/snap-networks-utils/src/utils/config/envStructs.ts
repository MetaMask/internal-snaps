import type { Struct } from '@metamask/superstruct';
import {
  array,
  coerce,
  defaulted,
  min,
  number,
  optional,
  string,
} from '@metamask/superstruct';

import { UrlStruct } from '../urlStruct/urlStruct';

/**
 * Create a struct for environment variables validated against the given
 * struct, where unset and empty strings (the build-time injection default)
 * mean the variable is not set.
 *
 * @param item - The struct to validate the value against when it is set,
 * e.g. `UrlStruct`.
 * @returns A struct that parses to the value or `undefined`.
 * @example
 * const PriceApiBaseUrlStruct = emptyToUndefined(UrlStruct);
 */
export const emptyToUndefined = <Type>(
  item: Struct<Type>,
): Struct<Type | undefined> =>
  coerce(optional(item), string(), (value: string) =>
    value === '' ? undefined : value,
  );

/**
 * Create a struct for comma-separated list environment variables.
 *
 * The raw string is split on commas and each item is validated against the
 * given item struct.
 *
 * @param item - The struct to validate each list item against.
 * @returns A struct that parses a comma-separated string into an array.
 * @example
 * const RpcUrlListStruct = commaSeparatedListOf(UrlStruct);
 */
export const commaSeparatedListOf = <Type>(
  item: Struct<Type>,
): Struct<Type[]> =>
  coerce(array(item), string(), (value: string) => value.split(','));

/**
 * Create a struct for a URL environment variable with a fallback: unset and
 * empty values (the build-time injection default) resolve to the fallback,
 * and invalid values are rejected.
 *
 * @param fallback - The URL to use when the variable is unset or empty.
 * @returns A struct that parses to the URL.
 * @example
 * const EsploraUrlStruct = defaultedUrlStruct('https://blockstream.info/api');
 */
export const defaultedUrlStruct = (fallback: string): Struct<string> =>
  coerce(defaulted(UrlStruct, fallback), string(), (value: string) =>
    value === '' ? undefined : value,
  );

/**
 * Create a struct that parses an integer from a string, with a minimum value
 * and a default for unset variables.
 *
 * @param minValue - The minimum value for the integer.
 * @param defaultValue - The default value for the integer.
 * @returns A struct that parses an integer from a string.
 */
export const parseIntegerStruct = (
  minValue: number,
  defaultValue: number,
): Struct<number> =>
  coerce(
    defaulted(min(number(), minValue), defaultValue),
    string(),
    (value: string) => (value === '' ? undefined : parseInt(value, 10)),
  );

/**
 * Create a struct that parses a float from a string, with a minimum value and
 * a default for unset variables.
 *
 * @param minValue - The minimum value for the float.
 * @param defaultValue - The default value for the float.
 * @returns A struct that parses a float from a string.
 */
export const parseFloatStruct = (
  minValue: number,
  defaultValue: number,
): Struct<number> =>
  coerce(
    defaulted(min(number(), minValue), defaultValue),
    string(),
    (value: string) => (value === '' ? undefined : parseFloat(value)),
  );
