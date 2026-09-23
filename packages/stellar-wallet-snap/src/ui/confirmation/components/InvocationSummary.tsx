import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Box, Copyable, Text as SnapText } from '@metamask/snaps-sdk/jsx';

import { i18n } from '../../../utils';

export type InvocationSummaryProps = {
  locale: string;
  contractAddress: string | null;
  functionName: string | null;
};

/**
 * Shared Soroban call header for sign-transaction and sign-auth-entry:
 *
 * - Contract Address (copyable), when present
 * - Function name, when present
 *
 * Extra fields (args, salt, executable, …) are rendered by the parent
 * line-by-line so create-contract details are never dropped.
 *
 * @param props - Contract / function and i18n helper.
 * @param props.locale - The locale to use for the translation.
 * @param props.contractAddress - Contract `C…` strkey, or `null` for deploy.
 * @param props.functionName - Contract or host-function name, if any.
 * @returns Vertical confirmation rows for the invocation header.
 */
export const InvocationSummary = ({
  locale,
  contractAddress,
  functionName,
}: InvocationSummaryProps): ComponentOrElement => {
  const translate = i18n(locale);
  return (
    <Box direction="vertical">
      {contractAddress ? (
        <Box direction="vertical">
          <SnapText fontWeight="medium" color="alternative">
            {translate('confirmation.invocation.contractAddress')}
          </SnapText>
          <Copyable value={contractAddress} />
        </Box>
      ) : null}

      {functionName === null ? null : (
        <Box direction="vertical">
          <SnapText fontWeight="medium" color="alternative">
            {translate('confirmation.invocation.functionName')}
          </SnapText>
          <SnapText>{functionName}</SnapText>
        </Box>
      )}
    </Box>
  );
};
