import { KnownCaip2ChainId } from '../../../api';
import { FieldType } from '../../../services/transaction';
import { formatFiat, tokenToFiat } from '../../../utils';
import { defaultPreferences as preferences } from '../__fixtures__/confirmation.fixtures';
import { resolveAssetDisplay } from '../utils';
import { ReadableParamsList } from './ReadableParamsList';

const scope = KnownCaip2ChainId.Mainnet;
const USDC = 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const nativeAssetId = resolveAssetDisplay(scope, 'native')?.assetId as string;
const fiat = formatFiat(tokenToFiat('1.5', '0.1'), 'usd', 'en');

const render = (
  props: Partial<Parameters<typeof ReadableParamsList>[0]> = {},
): string =>
  JSON.stringify(
    ReadableParamsList({
      params: [
        {
          key: 'amount',
          type: FieldType.assetWithAmount,
          value: ['native', '1.5'],
        },
      ],
      locale: 'en',
      scope,
      ...props,
    }),
  );

describe('ReadableParamsList', () => {
  describe('asset values', () => {
    it('renders the fiat value before an asset amount', () => {
      const serialized = render({
        preferences,
        tokenPrices: { [nativeAssetId]: '0.1' } as never,
      });

      expect(serialized).toContain('"children":"1.5 XLM"');
      expect(serialized.indexOf(fiat)).toBeGreaterThan(-1);
      expect(serialized.indexOf(fiat)).toBeLessThan(
        serialized.indexOf('1.5 XLM'),
      );
    });

    it('renders a skeleton instead of the fiat value while prices load', () => {
      const serialized = render({
        preferences,
        tokenPrices: { [nativeAssetId]: '0.1' } as never,
        priceLoading: true,
      });

      expect(serialized).toContain('"type":"Skeleton"');
      expect(serialized).not.toContain(fiat);
    });

    it('renders neither fiat nor skeleton without preferences', () => {
      const serialized = render({
        tokenPrices: { [nativeAssetId]: '0.1' } as never,
        priceLoading: true,
      });

      expect(serialized).not.toContain('"type":"Skeleton"');
      expect(serialized).not.toContain(fiat);
      expect(serialized).toContain('"children":"1.5 XLM"');
    });

    it('renders neither fiat nor skeleton when the price is undefined', () => {
      const serialized = render({ preferences, tokenPrices: {} as never });

      expect(serialized).not.toContain('"type":"Skeleton"');
      expect(serialized).not.toContain(fiat);
    });

    it('renders neither fiat nor skeleton for an asset without an amount', () => {
      const serialized = render({
        params: [{ key: 'asset', type: FieldType.asset, value: USDC }],
        preferences,
        tokenPrices: {
          [resolveAssetDisplay(scope, USDC)?.assetId as string]: '0.1',
        } as never,
        priceLoading: true,
      });

      expect(serialized).toContain('"type":"Link"');
      expect(serialized).not.toContain('"type":"Skeleton"');
    });

    it('renders a classic asset as an explorer link with the fallback icon', () => {
      const serialized = render({
        params: [{ key: 'asset', type: FieldType.asset, value: USDC }],
        preferences,
      });

      expect(serialized).toContain('"type":"Link"');
      expect(serialized).toContain('"children":"USDC"');
      expect(serialized).toContain('"type":"Image"');
      expect(serialized).not.toContain('"type":"Skeleton"');
    });

    it('falls back to the raw reference for liquidity pool ids', () => {
      const poolId = 'a'.repeat(64);
      const serialized = render({
        params: [{ key: 'asset', type: FieldType.asset, value: poolId }],
      });

      expect(serialized).toContain(`"children":"${poolId}"`);
      expect(serialized).not.toContain('"type":"Image"');
    });
  });
});
