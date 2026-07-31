import type { CoreMessengerActions } from '../../types/core-messenger';
import { CORE_MESSENGER_NAMESPACE } from '../../types/core-messenger';
import { ASSETS_SERVICE_NAME } from './messenger';

describe('messenger types', () => {
  it('exports service and core messenger namespaces', () => {
    expect(ASSETS_SERVICE_NAME).toBe('AssetsService');
    expect(CORE_MESSENGER_NAMESPACE).toBe('SnapCore');
  });

  it('defines core messenger actions for assets controller lookups', () => {
    const actions = [
      'AssetsController:getAccountAssetByID',
      'AssetsController:getAccountAssetsByIDs',
      'AssetsController:getAccountAssetsByScope',
    ] satisfies CoreMessengerActions['type'][];

    expect(actions).toHaveLength(3);
  });
});
