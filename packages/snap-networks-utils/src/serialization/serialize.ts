import type { Json } from '@metamask/snaps-sdk';
import { BigNumber } from 'bignumber.js';
import { cloneDeepWith } from 'lodash';

import type { Serializable } from './types';

/**
 * Serializes the passed value to a JSON object so it can be stored in JSON-serializable storage like the snap state and interface context.
 * It transforms non-JSON-serializable values into a specific JSON-serializable representation that can be deserialized later.
 *
 * @param value - The value to serialize.
 * @returns The serialized value.
 */
export const serialize = (value: Serializable): Json =>
  cloneDeepWith(value, (val: unknown) => {
    if (val === undefined) {
      return {
        __type: 'undefined',
      };
    }

    if (val instanceof BigNumber) {
      return {
        __type: 'BigNumber',
        value: val.toString(),
      };
    }

    if (typeof val === 'bigint') {
      return {
        __type: 'bigint',
        value: val.toString(),
      };
    }

    if (val instanceof Uint8Array) {
      const binaryString = Array.from(val, (byte) =>
        String.fromCharCode(byte),
      ).join('');
      return {
        __type: 'Uint8Array',
        value: btoa(binaryString),
      };
    }

    // Return undefined to let lodash handle the cloning of other values
    return undefined;
  });
