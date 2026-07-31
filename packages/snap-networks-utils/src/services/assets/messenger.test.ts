import type { CoreMessengerCaller } from '../../types/core-messenger';
import { CORE_MESSENGER_NAMESPACE } from '../../types/core-messenger';
import type { AssetsServiceAllowedActions } from './messenger';
import type { AssetsServiceMessengerCaller } from './messenger';
import { ASSETS_SERVICE_NAME } from './messenger';

describe('messenger types', () => {
  it('exports service and core messenger namespaces', () => {
    expect(ASSETS_SERVICE_NAME).toBe('AssetsService');
    expect(CORE_MESSENGER_NAMESPACE).toBe('SnapCore');
  });

  it('defines assets service allowed actions for controller lookups', () => {
    const actions = [
      'AssetsController:getAccountAssetByID',
      'AssetsController:getAccountAssetsByIDs',
      'AssetsController:getAccountAssetsByScope',
    ] satisfies AssetsServiceAllowedActions['type'][];

    expect(actions).toHaveLength(3);
  });

  it('keeps core and assets service callers compatible', () => {
    const assertCompatible = (
      caller: CoreMessengerCaller,
    ): AssetsServiceMessengerCaller => caller;

    expect(assertCompatible).toBeDefined();
  });
});
