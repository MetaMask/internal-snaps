import type { Json } from '@metamask/snaps-sdk';
import { BigNumber } from 'bignumber.js';

import type { Serializable } from './types';

/**
 * Deserializes the passed value from a JSON object to an object with its the original values.
 * It transforms the JSON-serializable representation of non-JSON-serializable values back into their original values.
 *
 * @param serializedValue - The value to deserialize.
 * @returns The deserialized value.
 */
export const deserialize = (serializedValue: Json): Serializable =>
  JSON.parse(JSON.stringify(serializedValue), (_key, value) => {
    if (!value) {
      return value;
    }

    if (value.__type === 'undefined') {
      return undefined;
    }

    if (value.__type === 'BigNumber') {
      return new BigNumber(value.value);
    }

    if (value.__type === 'bigint') {
      return BigInt(value.value);
    }

    if (value.__type === 'Uint8Array') {
      // Use TextEncoder to decode base64 string to Uint8Array
      const binaryString = atob(value.value);
      const bytes = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index++) {
        bytes[index] = binaryString.charCodeAt(index);
      }
      return bytes;
    }

    return value;
  });
