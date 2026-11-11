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
import type { FeePayment, UserFeeCost } from '../../utils/analyzeFeePayment';

function truncateAddress(address: string): string {
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

/**
 * How each verdict of {@link FeePayment.userCost} is shown. The tooltip of
 * `costs` only applies when the user may pay more than the costs listed.
 */
const USER_COST_DISPLAY = {
  free: {
    label: 'confirmation.youPay.free',
    color: 'success',
    fontWeight: 'bold',
    tooltip: 'confirmation.youPay.free.tooltip',
    icon: 'question',
  },
  unverified: {
    label: 'confirmation.youPay.unverified',
    color: 'warning',
    fontWeight: 'regular',
    tooltip: 'confirmation.youPay.unverified.tooltip',
    icon: 'warning',
  },
  costs: {
    label: 'confirmation.youPay.notFree',
    color: 'warning',
    fontWeight: 'regular',
    tooltip: 'confirmation.youPay.mayCostMore.tooltip',
    icon: 'warning',
  },
} as const;

type SolAmountProps = {
  amountInSol: string;
  symbol: string;
  currency: string;
  locale: string;
  nativePrice: number | null;
  pricesError: boolean;
  pricesFetching: boolean;
};

function renderSolAmount({
  amountInSol,
  symbol,
  currency,
  locale,
  nativePrice,
  pricesError,
  pricesFetching,
}: SolAmountProps): ComponentOrElement {
  const fiat =
    nativePrice && !pricesError
      ? formatFiat(tokenToFiat(amountInSol, nativePrice), currency, locale)
      : null;

  return (
    <Asset
      symbol={symbol}
      amount={formatCryptoBalance(amountInSol, locale)}
      hideIcon
      fiat={fiat}
      isFiatLoading={pricesFetching}
    />
  );
}

type FeePayerRowProps = {
  feePayment: FeePayment;
  scope: Network;
  preferences: Preferences;
};

const FeePayerRow: SnapComponent<FeePayerRowProps> = ({
  feePayment,
  scope,
  preferences,
}) => {
  const translate = i18n(preferences.locale);
  const sponsored = feePayment.paidBy === 'sponsor';

  return (
    <Box alignment="space-between" direction="horizontal">
      <Box alignment="space-between" direction="horizontal" center>
        <Text fontWeight="medium" color="alternative">
          {translate(
            sponsored ? 'confirmation.sponsoredBy' : 'confirmation.paidBy',
          )}
        </Text>
        <Tooltip
          content={translate(
            sponsored
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
  );
};

type UserCostRowProps = {
  userCost: Exclude<FeePayment['userCost'], null>;
  mayCostMore: boolean;
  uncheckedPrograms: string[];
  preferences: Preferences;
};

const UserCostRow: SnapComponent<UserCostRowProps> = ({
  userCost,
  mayCostMore,
  uncheckedPrograms,
  preferences,
}) => {
  const translate = i18n(preferences.locale);
  const display = USER_COST_DISPLAY[userCost];
  // `free` is never reached with unchecked programs, so the suffix is empty there.
  const showTooltip = userCost !== 'costs' || mayCostMore;
  const uncheckedProgramsSuffix = uncheckedPrograms.length
    ? ` ${translate('confirmation.youPay.uncheckedPrograms', {
        programs: uncheckedPrograms.map(truncateAddress).join(', '),
      })}`
    : '';

  return (
    <Box alignment="space-between" direction="horizontal">
      <Box alignment="space-between" direction="horizontal" center>
        <Text fontWeight="medium" color="alternative">
          {translate('confirmation.youPay')}
        </Text>
        {showTooltip ? (
          <Tooltip
            content={`${translate(display.tooltip)}${uncheckedProgramsSuffix}`}
          >
            <Icon name={display.icon} color="muted" />
          </Tooltip>
        ) : null}
      </Box>
      <Text fontWeight={display.fontWeight} color={display.color}>
        {translate(display.label)}
      </Text>
    </Box>
  );
};

type SolDisplayProps = {
  scope: Network;
  preferences: Preferences;
  nativePrice: number | null;
  fetchingPricesStatus: FetchStatus;
};

type RentRowProps = SolDisplayProps & {
  rentLamports: string;
};

const RentRow: SnapComponent<RentRowProps> = ({
  rentLamports,
  scope,
  preferences,
  nativePrice,
  fetchingPricesStatus,
}) => {
  const { currency, locale } = preferences;
  const translate = i18n(locale);

  return (
    <Box alignment="space-between" direction="horizontal">
      <Box alignment="space-between" direction="horizontal" center>
        <Text color="alternative">{translate('confirmation.rent')}</Text>
        <Tooltip content={translate('confirmation.rent.tooltip')}>
          <Icon name="question" color="muted" />
        </Tooltip>
      </Box>
      {renderSolAmount({
        amountInSol: lamportsToSol(BigInt(rentLamports)).toString(),
        symbol: Networks[scope].nativeToken.symbol,
        currency,
        locale,
        nativePrice,
        pricesError: fetchingPricesStatus === 'error',
        pricesFetching: fetchingPricesStatus === 'fetching',
      })}
    </Box>
  );
};

type PaidToSponsorRowProps = SolDisplayProps & {
  cost: Exclude<UserFeeCost, { type: 'rent' }>;
};

const PaidToSponsorRow: SnapComponent<PaidToSponsorRowProps> = ({
  cost,
  scope,
  preferences,
  nativePrice,
  fetchingPricesStatus,
}) => {
  const { currency, locale } = preferences;
  const translate = i18n(locale);

  return (
    <Box alignment="space-between" direction="horizontal">
      <Text color="alternative">{translate('confirmation.paidToSponsor')}</Text>
      {cost.type === 'solToSponsor' ? (
        renderSolAmount({
          amountInSol: lamportsToSol(cost.lamports).toString(),
          symbol: Networks[scope].nativeToken.symbol,
          currency,
          locale,
          nativePrice,
          pricesError: fetchingPricesStatus === 'error',
          pricesFetching: fetchingPricesStatus === 'fetching',
        })
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
};

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

  const rentLamports = feePayment?.userCosts.reduce(
    (total, cost) =>
      cost.type === 'rent' ? total + BigInt(cost.lamports) : total,
    0n,
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
        feePayment.paidBy === 'anotherWalletAccount') ? (
        <FeePayerRow
          feePayment={feePayment}
          scope={scope}
          preferences={preferences}
        />
      ) : null}
      {feePayment?.userCost ? (
        <UserCostRow
          userCost={feePayment.userCost}
          mayCostMore={feePayment.mayCostMore}
          uncheckedPrograms={feePayment.uncheckedPrograms}
          preferences={preferences}
        />
      ) : null}
      {rentLamports ? (
        <RentRow
          rentLamports={rentLamports.toString()}
          scope={scope}
          preferences={preferences}
          nativePrice={nativePrice}
          fetchingPricesStatus={fetchingPricesStatus}
        />
      ) : null}
      {feePayment?.userCosts.map((cost) =>
        cost.type === 'rent' ? null : (
          <PaidToSponsorRow
            key={cost.type === 'tokenToSponsor' ? cost.mint : cost.type}
            cost={cost}
            scope={scope}
            preferences={preferences}
            nativePrice={nativePrice}
            fetchingPricesStatus={fetchingPricesStatus}
          />
        ),
      )}
    </Section>
  );
};

export default TransactionDetails;
