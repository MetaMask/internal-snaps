import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';
import {
  InvalidParamsError,
  MethodNotFoundError,
  UnauthorizedError,
} from '@metamask/snaps-sdk';
import type { Struct } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';

import type { BrazeSdk } from './braze-sdk';
import { ALLOWED_ORIGIN } from './constants';
import { withBraze } from './runtime';
import { snapStorage } from './storage';
import type { SyncUserParams } from './structs';
import { SyncUserParamsStruct } from './structs';

export const BrazeMethod = {
  SyncUser: 'syncUser',
} as const;

const APPLIED_LANGUAGE_KEY = 'appliedLanguage';

/**
 * Validate request params against a struct.
 *
 * @param params - The request params.
 * @param struct - The struct to validate against.
 * @returns The validated params.
 * @throws {InvalidParamsError} If the params are invalid.
 */
function validateParams<Params>(
  params: unknown,
  struct: Struct<Params>,
): Params {
  const [error, value] = validate(params, struct);
  if (error) {
    throw new InvalidParamsError(error.message) as Error;
  }
  return value;
}

/**
 * Set the language of the current user, unless it was already set for this
 * user. The SDK sends every attribute it is given, even an unchanged one.
 *
 * @param sdk - The Braze SDK.
 * @param profileId - The canonical profile ID of the current user.
 * @param language - The ISO 639-1 language code.
 */
function setLanguage(sdk: BrazeSdk, profileId: string, language: string): void {
  const applied = JSON.stringify({ profileId, language });
  if (snapStorage.getItem(APPLIED_LANGUAGE_KEY) === applied) {
    return;
  }
  if (sdk.getUser()?.setLanguage(language)) {
    snapStorage.setItem(APPLIED_LANGUAGE_KEY, applied);
  }
}

/**
 * Identify the device as the given Braze user. Changes the user only when it
 * differs from the current one, then flushes because `setLanguage` only queues
 * attributes in storage and `initialize` does not renew an expired session
 * before the snap runtime tears down timers at the end of the request.
 *
 * @param params - The validated params.
 * @param params.profileId - The canonical profile ID of the user.
 * @param params.language - The language the user chose in MetaMask, as an ISO
 * 639-1 code. Left unchanged in Braze when omitted.
 * @param params.config - The Braze config.
 */
async function syncUser({
  profileId,
  language,
  config,
}: SyncUserParams): Promise<void> {
  await withBraze(
    config,
    (sdk) => {
      const currentUserId = sdk.getUser()?.getUserId() ?? null;
      if (currentUserId === null && language !== undefined) {
        // Queue before changeUser so initial identification promotes the
        // anonymous attribute and sends session start + language together.
        setLanguage(sdk, profileId, language);
      }
      if (currentUserId !== profileId) {
        sdk.changeUser(profileId);
      }
      if (currentUserId !== null && language !== undefined) {
        setLanguage(sdk, profileId, language);
      }
    },
    { flush: true },
  );
}

export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  if (origin !== ALLOWED_ORIGIN) {
    throw new UnauthorizedError() as Error;
  }

  switch (request.method) {
    case BrazeMethod.SyncUser:
      await syncUser(validateParams(request.params, SyncUserParamsStruct));
      return null;

    default:
      throw new MethodNotFoundError() as Error;
  }
};
