import { serialize } from '@metamask/snap-networks-utils';
import type { Serializable } from '@metamask/snap-networks-utils';

/**
 * Serializes the passed value to a string.
 *
 * @param params - The parameters to serialize.
 * @param params.value - The value to serialize.
 * @param params.replacer - The replacer function to use.
 * @param params.indent - The indent to use.
 * @returns The serialized value.
 */
export const serializeToString = ({
  value,
  replacer = null,
  indent = 2,
}: {
  value: Serializable;
  replacer?: (number | string)[] | null;
  indent?: number;
}): string => JSON.stringify(serialize(value), replacer, indent);
