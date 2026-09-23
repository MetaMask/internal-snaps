import type { ComponentOrElement } from '@metamask/snaps-sdk';
import { Box, Copyable, Text as SnapText } from '@metamask/snaps-sdk/jsx';
import type { Json } from '@metamask/utils';
import { isNullOrUndefined } from '@metamask/utils';

import type { KnownCaip2ChainId } from '../../../api';
import { FieldType } from '../../../services/transaction';
import type { ReadableOperationField } from '../../../services/transaction';
import type { LocalizedMessage } from '../../../utils';
import { i18n } from '../../../utils';
import type { ConfirmationBaseProps } from '../api';
import { resolveAssetDisplay } from '../utils';
import { Asset } from './Asset';
import { JsonParamsSummary } from './JsonParamsSummary';

export type ReadableParamsListProps = {
  params: ReadableOperationField[];
  locale: string;
  scope: KnownCaip2ChainId;
  preferences?: ConfirmationBaseProps['preferences'];
  tokenPrices?: ConfirmationBaseProps['tokenPrices'];
  priceLoading?: boolean;
};

const AmountRow = ({ amount }: { amount: string }): ComponentOrElement => {
  return <SnapText>{amount}</SnapText>;
};

const AssetParam = ({
  scope,
  assetReference,
  amount,
  preferences,
  price,
  priceLoading,
}: {
  scope: KnownCaip2ChainId;
  assetReference: string;
  amount?: string;
  preferences?: ConfirmationBaseProps['preferences'];
  price?: string | null;
  priceLoading?: boolean;
}): ComponentOrElement => {
  const resolved = resolveAssetDisplay(scope, assetReference);
  if (!resolved) {
    // Liquidity pool ids and other non-classic references fall back to the raw string.
    if (amount === undefined) {
      return <SnapText alignment="end">{assetReference}</SnapText>;
    }
    return (
      <Box direction="horizontal" alignment="end">
        <SnapText>{amount}</SnapText>
        <SnapText>{assetReference}</SnapText>
      </Box>
    );
  }

  return (
    <Asset
      symbol={resolved.symbol}
      amount={amount}
      iconUrl={resolved.iconUrl}
      link={resolved.link}
      preferences={preferences}
      price={price ?? null}
      priceLoading={priceLoading}
    />
  );
};

const RenderReadableParamValue = (params: {
  locale: string;
  type: string;
  value: Json;
  scope: KnownCaip2ChainId;
  preferences?: ConfirmationBaseProps['preferences'];
  tokenPrices?: ConfirmationBaseProps['tokenPrices'];
  priceLoading?: boolean;
}): ComponentOrElement | null => {
  const { type, value, scope, preferences, tokenPrices, priceLoading, locale } =
    params;
  if (isNullOrUndefined(value)) {
    return null;
  }
  switch (type) {
    case 'assetWithAmount': {
      if (!Array.isArray(value)) {
        return null;
      }
      const [assetReference, amount] = value as [string, string];
      const resolved = resolveAssetDisplay(scope, assetReference);
      const price = resolved ? (tokenPrices?.[resolved.assetId] ?? null) : null;
      return (
        <AssetParam
          scope={scope}
          assetReference={assetReference}
          amount={amount}
          preferences={preferences}
          price={price}
          priceLoading={priceLoading}
        />
      );
    }
    case 'asset':
      return <AssetParam scope={scope} assetReference={value as string} />;
    case 'address':
      return <Copyable value={value as string} />;
    case 'copyable':
      return typeof value === 'string' ? (
        <Copyable value={value} />
      ) : (
        <Copyable value={JSON.stringify(value)} />
      );
    case 'amount':
      return <AmountRow amount={value as string} />;
    case 'json':
      return <JsonParamsSummary value={value} locale={locale} />;
    case 'text':
    case 'number':
    case 'boolean':
    case 'price':
      return (
        <SnapText>
          {typeof value === 'string' ? value : JSON.stringify(value)}
        </SnapText>
      );
    default:
      return <JsonParamsSummary value={value} locale={locale} />;
  }
};

const shouldUseVerticalLayout = (param: ReadableOperationField): boolean => {
  if (param.type === FieldType.json || param.type === FieldType.copyable) {
    return true;
  }
  if (
    param.type === FieldType.asset ||
    param.type === FieldType.assetWithAmount
  ) {
    return false;
  }
  return typeof param.value === 'string' && param.value.length > 40;
};

/**
 * Labeled confirmation rows for mapped operation / authorization fields.
 *
 * Shared by invoke-host-function ops and the Authorizations section so
 * copyable / json / asset rows render the same way.
 *
 * @param props - Rows plus locale and optional price / preference context.
 * @param props.params - The parameters to display.
 * @param props.locale - The locale to use for the translation.
 * @param props.scope - The scope of the transaction.
 * @param props.preferences - The preferences to use for the translation.
 * @param props.tokenPrices - The token prices to use for the translation.
 * @param props.priceLoading - Whether the price is loading.
 * @returns Vertical labeled param list.
 */
export const ReadableParamsList = ({
  params,
  locale,
  scope,
  preferences,
  tokenPrices,
  priceLoading,
}: ReadableParamsListProps): ComponentOrElement => {
  const translate = i18n(locale);
  return (
    <Box direction="vertical">
      {params
        .filter((param) => !isNullOrUndefined(param.value))
        .map((param, paramIndex) => {
          const useVertical = shouldUseVerticalLayout(param);
          return (
            <Box
              key={`${param.key}-${paramIndex}`}
              alignment="space-between"
              direction={useVertical ? 'vertical' : 'horizontal'}
            >
              <SnapText fontWeight="medium" color="alternative">
                {translate(
                  `confirmation.transaction.param.${param.key}` as LocalizedMessage,
                )}
              </SnapText>
              <RenderReadableParamValue
                locale={locale}
                type={param.type}
                value={param.value}
                scope={scope}
                preferences={preferences}
                tokenPrices={tokenPrices}
                priceLoading={priceLoading}
              />
            </Box>
          );
        })}
    </Box>
  );
};
