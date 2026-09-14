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

import { STELLAR_TEXT_MEMO_MAX_BYTES } from '../../../../constants';
import type { LocalizedMessage } from '../../../../utils';
import { i18n } from '../../../../utils';
import type { ConfirmationBaseProps } from '../../api';
import { MemoEditFormNames } from './constants';

export type MemoEditScreenProps = {
  locale: ConfirmationBaseProps['locale'];
  memoDraft?: string;
  memoError?: LocalizedMessage | null;
};

/**
 * Screen for adding or updating a Stellar text memo on send confirmation.
 *
 * @param props - The screen props.
 * @param props.locale - The active locale.
 * @param props.memoDraft - Current draft memo text.
 * @param props.memoError - Optional validation error message key.
 * @returns The memo edit screen.
 */
export const MemoEditScreen = ({
  locale,
  memoDraft = '',
  memoError,
}: MemoEditScreenProps): ComponentOrElement => {
  const translate = i18n(locale);
  const errorText = memoError ? translate(memoError) : undefined;

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
            value={memoDraft}
            placeholder={translate('confirmation.memo.placeholder')}
          />
        </Field>
        <SnapText size="sm" color="muted">
          {translate('confirmation.memo.byteHint', {
            max: String(STELLAR_TEXT_MEMO_MAX_BYTES),
          })}
        </SnapText>
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
