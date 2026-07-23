import type { KeyringRequest } from '@metamask/keyring-api';
import type { DialogResult } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';

import { ConfirmSignMessage } from './ConfirmSignMessage';
import type { Network } from '../../../../constants';
import snapContext from '../../../../context';
import type { TronKeyringAccount } from '../../../../entities/keyring-account';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { formatOrigin } from '../../../../utils/formatOrigin';
import { FALLBACK_LANGUAGE } from '../../../../utils/i18n';
import { SignMessageRequestStruct } from '../../../../validation/structs';

/**
 * Renders the confirmation dialog for a sign message request.
 *
 * @param request - The keyring request to confirm.
 * @param account - The account that the request is for.
 * @returns The confirmation dialog result.
 */
export async function render(
  request: KeyringRequest,
  account: TronKeyringAccount,
): Promise<DialogResult> {
  assert(request.request.params, SignMessageRequestStruct);

  const {
    request: {
      params: { message: messageBase64 },
    },
    scope,
    origin,
  } = request;

  // Decode the base64 message to get the raw message
  // eslint-disable-next-line no-restricted-globals
  const messageUtf8 = Buffer.from(messageBase64, 'base64').toString('utf8');

  const locale = await snapContext.snapClient
    .getPreferences()
    .then((preferences) => preferences.locale)
    .catch(() => FALLBACK_LANGUAGE);

  const id = await snapContext.snapClient.createInterface(
    <ConfirmSignMessage
      message={messageUtf8}
      account={account}
      scope={scope as Network}
      locale={locale}
      networkImage={TRX_IMAGE_SVG}
      origin={formatOrigin(origin)}
    />,
    {},
  );

  const dialogPromise = snapContext.snapClient.showDialog(id);

  return dialogPromise;
}
