import type { ComponentOrElement } from '@metamask/snaps-sdk';
import {
  Box,
  Button,
  Container,
  Field,
  Footer,
  Heading,
  Input,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import type { LocalizedMessage } from '../../../../utils';
import { i18n } from '../../../../utils';
import type { ConfirmationBaseProps } from '../../api';
import { MemoEditFormNames } from './constants';

export type MemoEditScreenProps = {
  locale: ConfirmationBaseProps['locale'];
  memo?: string;
  errorKey?: LocalizedMessage | null;
};

/**
 * Screen for adding or updating a Stellar memo on send confirmation.
 *
 * @param props - The screen props.
 * @param props.locale - The active locale.
 * @param props.memo - Current memo text being edited.
 * @param props.errorKey - Optional validation error message key.
 * @returns The memo edit screen.
 */
export const MemoEditScreen = ({
  locale,
  memo = '',
  errorKey,
}: MemoEditScreenProps): ComponentOrElement => {
  const translate = i18n(locale);
  const errorText = errorKey ? translate(errorKey) : undefined;

  return (
    <Container>
      <Box>
        <Box alignment="center" center>
          <Heading size="lg">{translate('confirmation.memo.title')}</Heading>
        </Box>
        <SnapText color="alternative">
          {translate('confirmation.memo.description')}
        </SnapText>
        <Field label={translate('confirmation.memo')} error={errorText}>
          <Input
            name={MemoEditFormNames.Input}
            value={memo}
            placeholder={translate('confirmation.memo.placeholder')}
          />
        </Field>
      </Box>
      <Footer>
        <Button name={MemoEditFormNames.Back}>
          {translate('confirmation.memo.back')}
        </Button>
        <Button name={MemoEditFormNames.Save}>
          {translate('confirmation.memo.save')}
        </Button>
      </Footer>
    </Container>
  );
};
