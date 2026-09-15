import { create } from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';

/**
 * Parse and validate a raw environment record against a struct.
 *
 * This is the fail-fast entry point for building a snap configuration from
 * build-time injected environment variables. Parsing happens once, when the
 * configuration provider is constructed; an invalid environment stops the
 * snap at startup instead of producing undefined behaviour later.
 *
 * @param value - The raw environment record, e.g. `process.env` values
 * collected into an object.
 * @param struct - The struct describing the expected environment.
 * @returns The parsed and validated environment.
 * @throws If the environment does not match the struct.
 * @example
 * const env = parseEnv(process.env, EnvStruct);
 */
export const parseEnv = <Type>(
  value: Record<string, unknown>,
  struct: Struct<Type>,
): Type => {
  try {
    return create(value, struct);
  } catch (error) {
    throw new Error(
      `Invalid environment configuration: ${(error as Error).message}`,
    );
  }
};
