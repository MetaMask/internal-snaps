import {
  noopAssetHandlers,
  wrapSnapHandlers,
} from '@metamask/snap-networks-utils';
import { Json } from '@metamask/utils';

import { withCatchAndThrowSnapError } from './utils/errors';

async function noopHandler(): Promise<Json> {
  return Promise.resolve({} as Json);
}

export const { onKeyringRequest, onUserInput, onClientRequest, onCronjob } =
  wrapSnapHandlers(withCatchAndThrowSnapError, {
    onKeyringRequest: noopHandler,
    onUserInput: () => Promise.resolve(),
    onClientRequest: noopHandler,
    onCronjob: noopHandler,
  });

export const {
  onAssetsLookup,
  onAssetsConversion,
  onAssetHistoricalPrice,
  onAssetsMarketData,
} = noopAssetHandlers;
