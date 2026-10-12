import { KnownCaip2ChainId } from '../../../../api';
import { defaultPreferences as preferences } from '../../__fixtures__/confirmation.fixtures';
import { ConfirmSignChangeTrustOptOut } from '../ConfirmSignChangeTrustOptOut/ConfirmSignChangeTrustOptOut';
import { ConfirmSignChangeTrustOptIn } from './ConfirmSignChangeTrustOptIn';

type Props = Parameters<typeof ConfirmSignChangeTrustOptIn>[0];

const props = {
  account: {
    address: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  scope: KnownCaip2ChainId.Mainnet,
  assetMetadata: {
    assetId:
      'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    symbol: 'USDC',
    iconUrl: 'https://icon.example/usdc.png',
  },
  locale: 'en',
  networkImage: null,
  feeData: {
    assetId: 'stellar:pubnet/slip44:148',
    symbol: 'XLM',
    iconUrl: '',
    amount: '0.00001',
  },
  tokenPrices: {},
  origin: null,
  preferences,
  scan: null,
} as unknown as Props;

describe.each([
  ['ConfirmSignChangeTrustOptIn', ConfirmSignChangeTrustOptIn],
  ['ConfirmSignChangeTrustOptOut', ConfirmSignChangeTrustOptOut],
] as const)('%s', (_name, View) => {
  const serialized = JSON.stringify(View(props));

  it('renders the asset icon at the large size in the header', () => {
    expect(serialized).toContain(
      '"src":"https://icon.example/usdc.png","height":48,"width":48',
    );
  });

  it('renders the asset row as an explorer link without an amount', () => {
    expect(serialized).toContain(
      '"href":"https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN","children":"USDC"',
    );
  });
});
