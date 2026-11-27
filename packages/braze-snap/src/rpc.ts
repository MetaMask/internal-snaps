import type { OnClientRequestHandler } from '@metamask/snaps-sdk';
import { InvalidParamsError, MethodNotFoundError } from '@metamask/snaps-sdk';
import type { Struct } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';

import { SESSION_TIMEOUT_SECONDS } from './constants';
import { withBraze } from './runtime';
import { getAppliedLanguage, setAppliedLanguage } from './storage';
import type { SyncUserParams } from './structs';
import { SyncUserParamsStruct } from './structs';

export const BrazeMethod = {
  SyncUser: 'syncUser',
} as const;

export type SyncUserResult = {
  flushed: boolean;
};

const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_SECONDS * 1_000;

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
 * Identify the device as the given Braze user. Changes the user only when it
 * differs from the current one, sets the language when it changed or when the
 * tracked session window expired (so a new session re-asserts the device's
 * language if another device changed it), then flushes.
 *
 * @param params - The validated params.
 * @param params.profileId - The canonical profile ID of the user.
 * @param params.language - The language the user chose in MetaMask, as an ISO
 * 639-1 code. Left unchanged in Braze when omitted.
 * @param params.config - The Braze config.
 * @returns Whether the flush completed without network/backend failure.
 */
async function syncUser({
  profileId,
  language,
  config,
}: SyncUserParams): Promise<SyncUserResult> {
  return withBraze(config, async (sdk, flush) => {
    const now = Date.now();
    const currentUserId = sdk.getUser()?.getUserId() ?? null;
    const applied = getAppliedLanguage();
    const isActiveLanguageSession =
      applied?.profileId === profileId &&
      applied.language === language &&
      now < applied.sessionExpiresAt;

    let appliedInThisCall = false;
    const setLanguage = (): void => {
      if (language !== undefined && !isActiveLanguageSession) {
        appliedInThisCall = Boolean(sdk.getUser()?.setLanguage(language));
      }
    };

    if (currentUserId === null) {
      // Queue before changeUser so initial identification promotes the
      // anonymous attribute and sends session start + language together.
      setLanguage();
    }
    if (currentUserId !== profileId) {
      sdk.changeUser(profileId);
    }
    if (currentUserId !== null) {
      setLanguage();
    }

    const flushed = await flush();
    if (
      flushed &&
      language !== undefined &&
      (isActiveLanguageSession || appliedInThisCall)
    ) {
      setAppliedLanguage({
        profileId,
        language,
        sessionExpiresAt: now + SESSION_TIMEOUT_MS,
      });
    }

    return { flushed };
  });
}

export const onClientRequest: OnClientRequestHandler = async ({ request }) => {
  switch (request.method) {
    case BrazeMethod.SyncUser:
      return syncUser(validateParams(request.params, SyncUserParamsStruct));

    default:
      throw new MethodNotFoundError() as Error;
  }
};
