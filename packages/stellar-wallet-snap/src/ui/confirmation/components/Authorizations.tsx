import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Copyable,
  Heading,
  Section,
  Text as SnapText,
  Divider,
} from '@metamask/snaps-sdk/jsx';

import type { KnownCaip2ChainId } from '../../../api';
import type { ReadableAuthorizationJson } from '../../../services/transaction/OperationMapper';
import { i18n } from '../../../utils';
import { getInvocationDetailParams, getParam } from '../utils';
import { InvocationSummary } from './InvocationSummary';
import { ReadableParamsList } from './ReadableParamsList';

export type AuthorizationsProps = {
  locale: string;
  scope: KnownCaip2ChainId;
  authorizations: ReadableAuthorizationJson[];
};

export const Authorizations = ({
  authorizations,
  locale,
  scope,
}: AuthorizationsProps): ComponentOrElement => {
  const translate = i18n(locale);

  return (
    <Section>
      <Heading>{translate('confirmation.authorization.heading')}</Heading>
      {authorizations.map((authJson, index) => {
        const authorizedAddress = getParam<string>(
          authJson.params,
          'authorizedAddress',
        );
        const contractAddress = getParam<string | null>(
          authJson.params,
          'contractId',
        );
        const functionName = getParam<string | null>(
          authJson.params,
          'functionName',
        );
        const detailParams = getInvocationDetailParams(authJson.params);

        return (
          <Box
            key={`auth-${index}`}
            alignment="space-between"
            direction="vertical"
          >
            {authorizedAddress === null ? null : (
              <Box direction="vertical">
                <SnapText fontWeight="medium" color="alternative">
                  {translate('confirmation.authorization.authorizedAddress')}
                </SnapText>
                <Copyable value={authorizedAddress} />
              </Box>
            )}
            {contractAddress === null && functionName === null ? null : (
              <InvocationSummary
                locale={locale}
                contractAddress={contractAddress}
                functionName={functionName}
              />
            )}
            {detailParams.length === 0 ? null : (
              <ReadableParamsList
                params={detailParams}
                locale={locale}
                scope={scope}
              />
            )}
            <Box>{null}</Box>
            <Divider />
            <Box>{null}</Box>
          </Box>
        );
      })}
    </Section>
  );
};
