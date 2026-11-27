import type { Infer } from '@metamask/superstruct';
import {
  boolean,
  nonempty,
  object,
  optional,
  refine,
  string,
} from '@metamask/superstruct';

/**
 * Check that a Braze endpoint is a bare `host[:port]` without a scheme, path,
 * query, fragment, or credentials.
 *
 * @param value - The endpoint string.
 * @returns Whether the value is a valid bare host.
 */
function isBareHost(value: string): boolean {
  try {
    return new URL(`https://${value}`).host === value;
  } catch {
    return false;
  }
}

export const BrazeConfigStruct = object({
  apiKey: nonempty(string()),
  endpoint: refine(nonempty(string()), 'Braze endpoint', isBareHost),
  appVersion: nonempty(string()),
  enableLogging: optional(boolean()),
});

export const SyncUserParamsStruct = object({
  profileId: nonempty(string()),
  language: optional(nonempty(string())),
  config: BrazeConfigStruct,
});

export type SyncUserParams = Infer<typeof SyncUserParamsStruct>;
