import type { Infer } from '@metamask/superstruct';
import {
  boolean,
  object,
  optional,
  pattern,
  size,
  string,
} from '@metamask/superstruct';

import {
  BRAZE_API_KEY_REGEX,
  BRAZE_ENDPOINT_REGEX,
  LANGUAGE_REGEX,
  MAX_APP_VERSION_LENGTH,
  MAX_PROFILE_ID_LENGTH,
} from './constants';

export const BrazeConfigStruct = object({
  apiKey: pattern(string(), BRAZE_API_KEY_REGEX),
  endpoint: pattern(string(), BRAZE_ENDPOINT_REGEX),
  appVersion: size(string(), 1, MAX_APP_VERSION_LENGTH),
  enableLogging: optional(boolean()),
});

export const SyncUserParamsStruct = object({
  profileId: size(string(), 1, MAX_PROFILE_ID_LENGTH),
  language: optional(pattern(string(), LANGUAGE_REGEX)),
  config: BrazeConfigStruct,
});

export type SyncUserParams = Infer<typeof SyncUserParamsStruct>;
