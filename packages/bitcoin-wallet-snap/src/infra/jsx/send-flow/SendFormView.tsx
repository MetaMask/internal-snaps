import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import {
  Banner,
  Box,
  Button,
  Container,
  Footer,
  Text as SnapText,
} from '@metamask/snaps-sdk/jsx';

import type { Messages, SendFormContext } from '../../../entities';
import { SendFormEvent } from '../../../entities';
import { HeadingWithReturn, SendForm } from '../components';
import { errorCodeToLabel, translate } from '../format';

type SendFormViewProps = {
  context: SendFormContext;
  messages: Messages;
};

export const SendFormView: SnapComponent<SendFormViewProps> = ({
  context,
  messages,
}) => {
  const tr = translate(messages);
  const { errors } = context;

  return (
    <Container>
      <Box>
        <HeadingWithReturn
          heading={tr('send')}
          returnButtonName={SendFormEvent.Cancel}
        />

        <SendForm {...context} messages={messages} />

        {errors.tx && (
          <Box>
            <Box>{null}</Box>
            <Banner title={tr('error')} severity="warning">
              <SnapText size="sm">
                {tr(errorCodeToLabel(errors.tx.code))}
              </SnapText>
            </Banner>
          </Box>
        )}
      </Box>

      <Footer>
        <Button name={SendFormEvent.Confirm} disabled={!context.fee}>
          {tr('continue')}
        </Button>
      </Footer>
    </Container>
  );
};
