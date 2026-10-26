import { DEFAULT_METAMASK_ORIGIN, Asset } from '@metamask/snap-networks-utils';
import type { ComponentOrElement } from '@metamask/snaps-sdk';
import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import {
  Address,
  Box,
  Icon,
  Image,
  Section,
  Text,
  Tooltip,
} from '@metamask/snaps-sdk/jsx';
import { BigNumber } from 'bignumber.js';

import { Domain } from '../../../../core/components/Domain/Domain';
import type { Network } from '../../../../core/constants/solana';
import { Networks } from '../../../../core/constants/solana';
import type { FetchStatus, Preferences } from '../../../../core/types/snap';
import { addressToCaip10 } from '../../../../core/utils/addressToCaip10';
import { lamportsToSol } from '../../../../core/utils/conversion';
import { formatCryptoBalance } from '../../../../core/utils/formatCryptoBalance';
import { formatFiat } from '../../../../core/utils/formatFiat';
import { i18n } from '../../../../core/utils/i18n';
import { parseOrigin } from '../../../../core/utils/parseOrigin';
import { tokenToFiat } from '../../../../core/utils/tokenToFiat';
import type { FeePayment } from '../../utils/analyzeFeePayment';

const truncateAddress = (address: string): string =>
  `${address.slice(0, 5)}...${address.slice(-5)}`;

type TransactionDetailsProps = {
  accountAddress: string | null;
  accountDomain: string | null;
  destinationAddress: string | null;
  destinationDomain: string | null;
  scope: Network;
  feeInSol: string | null;
  feePayment: FeePayment | null;
  nativePrice: number | null;
  fetchingPricesStatus: FetchStatus;
  preferences: Preferences;
  networkImage: string | null;
  origin: string;
};

export const TransactionDetails: SnapComponent<TransactionDetailsProps> = ({
  origin,
  accountAddress,
  accountDomain,
  destinationAddress,
  destinationDomain,
  scope,
  feeInSol,
  feePayment,
  nativePrice,
  fetchingPricesStatus,
  preferences,
  networkImage,
}) => {
  const { currency, locale } = preferences;
  const translate = i18n(locale);
  const isMetaMaskOrigin = origin === DEFAULT_METAMASK_ORIGIN;
  const originHostname =
    origin && !isMetaMaskOrigin ? parseOrigin(origin) : null;

  const pricesFetching = fetchingPricesStatus === 'fetching';
  const pricesError = fetchingPricesStatus === 'error';

  const toFiat = (amountInSol: string): string | null =>
    nativePrice && !pricesError
      ? formatFiat(tokenToFiat(amountInSol, nativePrice), currency, locale)
      : null;

  const feeInFiat = feeInSol ? toFiat(feeInSol) : null;

  const nativeSymbol = Networks[scope].nativeToken.symbol;

  const renderSol = (amountInSol: string): ComponentOrElement => (
    <Asset
      symbol={nativeSymbol}
      amount={formatCryptoBalance(amountInSol, locale)}
      hideIcon
      fiat={toFiat(amountInSol)}
      isFiatLoading={pricesFetching}
    />
  );

  const uncheckedPrograms = feePayment?.uncheckedPrograms.length
    ? ` ${translate('confirmation.youPay.uncheckedPrograms', {
        programs: feePayment.uncheckedPrograms.map(truncateAddress).join(', '),
      })}`
    : '';

  const rentInSol = feePayment?.userCosts.reduce(
    (total, cost) =>
      cost.type === 'rent' ? total.plus(lamportsToSol(cost.lamports)) : total,
    BigNumber(0),
  );

  return (
    <Section>
      {originHostname ? (
        <Box>
          <Box alignment="space-between" direction="horizontal">
            <Box alignment="space-between" direction="horizontal" center>
              <Text fontWeight="medium" color="alternative">
                {translate('confirmation.origin')}
              </Text>
              <Tooltip content={translate('confirmation.origin.tooltip')}>
                <Icon name="question" color="muted" />
              </Tooltip>
            </Box>
            <Text>{originHostname}</Text>
          </Box>
          <Box>{null}</Box>
        </Box>
      ) : null}
      <Box alignment="space-between" direction="horizontal">
        <Text fontWeight="medium" color="alternative">
          {translate('confirmation.account')}
        </Text>
        {accountDomain && accountAddress ? (
          <Domain
            domain={accountDomain}
            scope={scope}
            address={accountAddress}
          />
        ) : null}
        {!accountDomain && accountAddress ? (
          <Address
            address={addressToCaip10(scope, accountAddress)}
            truncate
            displayName
            avatar
          />
        ) : null}
      </Box>
      {destinationAddress ? (
        <Box>
          <Box>{null}</Box>
          <Box alignment="space-between" direction="horizontal">
            <Text fontWeight="medium" color="alternative">
              {translate('confirmation.recipient')}
            </Text>
            {destinationDomain ? (
              <Domain
                domain={destinationDomain}
                scope={scope}
                address={destinationAddress}
              />
            ) : (
              <Address
                address={addressToCaip10(scope, destinationAddress)}
                truncate
                displayName
                avatar
              />
            )}
          </Box>
        </Box>
      ) : null}
      <Box>{null}</Box>
      <Box alignment="space-between" direction="horizontal">
        <Text fontWeight="medium" color="alternative">
          {translate('confirmation.network')}
        </Text>
        <Box direction="horizontal" alignment="center">
          <Box alignment="center" center>
            <Image borderRadius="medium" src={networkImage ?? ''} />
          </Box>
          <Text>{Networks[scope].name}</Text>
        </Box>
      </Box>
      <Box>{null}</Box>
      <Box alignment="space-between" direction="horizontal">
        <Text fontWeight="medium" color="alternative">
          {translate('confirmation.fee')}
        </Text>
        {feeInSol ? (
          <Asset
            symbol={Networks[scope].nativeToken.symbol}
            amount={formatCryptoBalance(feeInSol, locale)}
            hideIcon
            fiat={feeInFiat}
            isFiatLoading={pricesFetching}
          />
        ) : (
          <Tooltip content={translate('confirmation.feeError')}>
            <Icon name="warning" />
          </Tooltip>
        )}
      </Box>
      {feePayment &&
      (feePayment.paidBy === 'sponsor' ||
        feePayment.paidBy === 'ownAccount') ? (
        <Box alignment="space-between" direction="horizontal">
          <Box alignment="space-between" direction="horizontal" center>
            <Text fontWeight="medium" color="alternative">
              {translate(
                feePayment.paidBy === 'sponsor'
                  ? 'confirmation.sponsoredBy'
                  : 'confirmation.paidBy',
              )}
            </Text>
            <Tooltip
              content={translate(
                feePayment.paidBy === 'sponsor'
                  ? 'confirmation.sponsoredBy.tooltip'
                  : 'confirmation.paidBy.tooltip',
              )}
            >
              <Icon name="question" color="muted" />
            </Tooltip>
          </Box>
          <Address
            address={addressToCaip10(scope, feePayment.feePayer)}
            truncate
            displayName
            avatar
          />
        </Box>
      ) : null}
      {feePayment?.paidBy === 'sponsor' ? (
        <Box alignment="space-between" direction="horizontal">
          <Box alignment="space-between" direction="horizontal" center>
            <Text fontWeight="medium" color="alternative">
              {translate('confirmation.youPay')}
            </Text>
            {feePayment.userCost === 'free' ? (
              <Tooltip content={translate('confirmation.youPay.free.tooltip')}>
                <Icon name="question" color="muted" />
              </Tooltip>
            ) : null}
            {feePayment.userCost === 'unverified' ? (
              <Tooltip
                content={`${translate('confirmation.youPay.unverified.tooltip')}${uncheckedPrograms}`}
              >
                <Icon name="warning" color="muted" />
              </Tooltip>
            ) : null}
            {feePayment.userCost === 'costs' && feePayment.mayCostMore ? (
              <Tooltip
                content={`${translate('confirmation.youPay.mayCostMore.tooltip')}${uncheckedPrograms}`}
              >
                <Icon name="warning" color="muted" />
              </Tooltip>
            ) : null}
          </Box>
          {feePayment.userCost === 'free' ? (
            <Text fontWeight="bold" color="success">
              {translate('confirmation.youPay.free')}
            </Text>
          ) : null}
          {feePayment.userCost === 'unverified' ? (
            <Text color="warning">
              {translate('confirmation.youPay.unverified')}
            </Text>
          ) : null}
          {feePayment.userCost === 'costs' ? (
            <Text color="warning">
              {translate('confirmation.youPay.notFree')}
            </Text>
          ) : null}
        </Box>
      ) : null}
      {rentInSol?.isGreaterThan(0) ? (
        <Box alignment="space-between" direction="horizontal">
          <Box alignment="space-between" direction="horizontal" center>
            <Text color="alternative">{translate('confirmation.rent')}</Text>
            <Tooltip content={translate('confirmation.rent.tooltip')}>
              <Icon name="question" color="muted" />
            </Tooltip>
          </Box>
          {renderSol(rentInSol.toString())}
        </Box>
      ) : null}
      {feePayment?.userCosts.map((cost) => {
        if (cost.type === 'rent') {
          return null;
        }

        return (
          <Box
            key={cost.type === 'tokenToSponsor' ? cost.mint : cost.type}
            alignment="space-between"
            direction="horizontal"
          >
            <Text color="alternative">
              {translate('confirmation.paidToSponsor')}
            </Text>
            {cost.type === 'solToSponsor' ? (
              renderSol(lamportsToSol(cost.lamports).toString())
            ) : (
              <Asset
                symbol={cost.symbol ?? truncateAddress(cost.mint)}
                amount={formatCryptoBalance(
                  BigNumber(cost.amount).shiftedBy(-cost.decimals).toString(),
                  locale,
                )}
                hideIcon
                fiat={null}
                isFiatLoading={false}
              />
            )}
          </Box>
        );
      })}
    </Section>
  );
};

export default TransactionDetails;
