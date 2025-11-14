import type { DialogResult } from '@metamask/snaps-sdk';

import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from './types';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import type { AssetEntity } from '../../../../entities/assets';
import type { ComputeFeeResult } from '../../../../services/send/types';
import { TRX_IMAGE_SVG } from '../../../../static/tron-logo';
import { generateImageComponent } from '../../../utils/generateImageComponent';
import { getIconUrlForKnownAsset } from '../../utils/getIconUrlForKnownAsset';

export const DEFAULT_CONFIRMATION_CONTEXT: ConfirmTransactionRequestContext = {
  scope: Network.Mainnet,
  fromAddress: null,
  toAddress: null,
  amount: null,
  fees: [],
  asset: {
    assetType: `${Network.Mainnet}/slip44:195`,
    keyringAccountId: '',
    network: Network.Mainnet,
    symbol: 'TRX',
    decimals: 6,
    rawAmount: '0',
    uiAmount: '0',
    iconUrl: '',
    imageSvg: TRX_IMAGE_SVG,
  },
  origin: 'MetaMask',
  networkImage: TRX_IMAGE_SVG,
  preferences: {
    locale: 'en',
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: false,
    useExternalPricingData: true,
    simulateOnChainActions: false,
    useTokenDetection: true,
    batchCheckBalances: true,
    displayNftMedia: false,
    useNftDetection: false,
  },
};

/**
 * Render the ConfirmTransactionRequest UI and show a dialog resolving to the user's choice.
 *
 * @param snapClient - The SnapClient instance for API interactions.
 * @param incomingContext - The initial context for the confirmation view.
 * @param incomingContext.scope - The network scope for the transaction.
 * @param incomingContext.fromAddress - The sender address.
 * @param incomingContext.toAddress - The recipient address.
 * @param incomingContext.amount - The amount to send (as a string).
 * @param incomingContext.fees - The detailed fee breakdown array.
 * @param incomingContext.asset - The asset involved in the transaction.
 * @param incomingContext.origin - The origin string to display.
 * @returns A dialog result with the user's decision.
 */
export async function render(
  snapClient: SnapClient,
  incomingContext: {
    scope: Network;
    fromAddress: string;
    toAddress: string;
    amount: string;
    fees: ComputeFeeResult;
    asset: AssetEntity;
    origin: string;
  },
): Promise<DialogResult> {
  const context: ConfirmTransactionRequestContext = {
    ...DEFAULT_CONFIRMATION_CONTEXT,
    ...incomingContext,
  };

  try {
    context.preferences = await snapClient.getPreferences();
  } catch {
    // keep defaults
  }

  /**
   * Generate SVG images for all assets (it's an async process so it must be done here).
   */
  const [assetSvg, ...feeSvgs] = await Promise.all([
    generateImageComponent(context.asset.iconUrl, 16, 16),
    ...context.fees.map(async (fee) => {
      return await generateImageComponent(
        getIconUrlForKnownAsset(fee.asset.type),
        16,
        16,
      );
    }),
  ]);

  /**
   * There will always be SVGs for the assets because we fallback to the question mark SVG.
   */
  context.asset = {
    ...context.asset,
    imageSvg: assetSvg,
  };
  context.fees.forEach((fee, index) => {
    fee.asset.imageSvg = feeSvgs[index] ?? '';
  });

  const id = await snapClient.createInterface(
    <ConfirmTransactionRequest context={context} />,
    context,
  );
  const dialogPromise = snapClient.showDialog(id);

  return dialogPromise;
}
