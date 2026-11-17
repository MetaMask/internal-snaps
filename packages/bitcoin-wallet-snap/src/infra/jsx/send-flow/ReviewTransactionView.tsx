import { Psbt } from '@metamask/bitcoindevkit';
import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import {
  Box,
  Button,
  Container,
  Footer,
  Heading,
  Row,
  Section,
  Text as SnapText,
  Value,
  Address,
  Link,
} from '@metamask/snaps-sdk/jsx';

import { configProvider } from '../../../config';
import type { Messages, ReviewTransactionContext } from '../../../entities';
import {
  BlockTime,
  networkToCurrencyUnit,
  ReviewTransactionEvent,
} from '../../../entities';
import { AssetIcon, HeadingWithReturn } from '../components';
import {
  displayAmount,
  displayCaip10,
  displayExchangeAmount,
  displayExplorerUrl,
  isValidSnapLinkProtocol,
  translate,
} from '../format';

type ReviewTransactionViewProps = {
  context: ReviewTransactionContext;
  messages: Messages;
};

export const ReviewTransactionView: SnapComponent<
  ReviewTransactionViewProps
> = ({ context, messages }) => {
  const tr = translate(messages);
  const { amount, exchangeRate, recipient, network, from, explorerUrl } =
    context;

  const psbt = Psbt.from_string(context.psbt);
  const fee = psbt.fee().to_sat();
  const feeRate = psbt.fee_rate()?.to_sat_per_vb_floor();
  const total = BigInt(amount) + fee;
  const currency = networkToCurrencyUnit[network];

  return (
    <Container>
      <Box>
        <HeadingWithReturn
          returnButtonName={ReviewTransactionEvent.HeaderBack}
          heading={tr('review')}
        />

        <Box alignment="center" center>
          <AssetIcon network={network} />
          <Heading size="lg">{displayAmount(BigInt(amount), currency)}</Heading>
          <SnapText color="muted">
            {displayExchangeAmount(BigInt(amount), exchangeRate)}
          </SnapText>
        </Box>

        <Section>
          <Row label={tr('from')}>
            {isValidSnapLinkProtocol(explorerUrl) ? (
              <Link href={displayExplorerUrl(explorerUrl, from)}>
                <Address address={displayCaip10(network, from)} displayName />
              </Link>
            ) : (
              <Address address={displayCaip10(network, from)} displayName />
            )}
          </Row>
          <Row label={tr('recipient')}>
            {isValidSnapLinkProtocol(explorerUrl) ? (
              <Link href={displayExplorerUrl(explorerUrl, recipient)}>
                <Address
                  address={displayCaip10(network, recipient)}
                  displayName
                />
              </Link>
            ) : (
              <Address
                address={displayCaip10(network, recipient)}
                displayName
              />
            )}
          </Row>
        </Section>

        <Section>
          <Row
            label={tr('transactionSpeed')}
            tooltip={tr('transactionSpeedTooltip')}
          >
            <SnapText>
              {`${configProvider.config.targetBlocksConfirmation * BlockTime[network]} ${tr(
                'minutes',
              )}`}
            </SnapText>
          </Row>
          <Row label={tr('networkFee')} tooltip={tr('networkFeeTooltip')}>
            <Value
              value={`${fee} sats`}
              extra={displayExchangeAmount(BigInt(fee), exchangeRate)}
            />
          </Row>
          <Row label={tr('feeRate')}>
            <SnapText>{`${feeRate} sat/vB`}</SnapText>
          </Row>
          <Row label={tr('total')}>
            <Value
              value={displayAmount(total, currency)}
              extra={displayExchangeAmount(total, exchangeRate)}
            />
          </Row>
        </Section>
      </Box>

      <Footer>
        <Button name={ReviewTransactionEvent.Send} type="submit">
          {tr('send')}
        </Button>
      </Footer>
    </Container>
  );
};
