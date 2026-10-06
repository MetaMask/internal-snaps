import { KnownCaip2ChainId } from '../../api';
import { ClientRequestMethod } from '../../handlers/clientRequest/api';
import type { ConfirmSendJsonRpcRequest } from '../../handlers/clientRequest/api';
import {
  ConfirmationContextRefresherKey,
  RefreshConfirmationContextHandler,
} from '../../handlers/cronjob/refreshConfirmationContext';
import {
  createInterface,
  getPreferences,
  showDialog,
  updateInterfaceIfExists,
} from '../../utils';
import { ConfirmationInterfaceKey, FetchStatus } from './api';
import { ConfirmationUXController } from './controller';
import { renderConfirmationView } from './views/render';

jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  createInterface: jest.fn(),
  showDialog: jest.fn(),
  updateInterfaceIfExists: jest.fn(),
  getPreferences: jest.fn(),
}));

jest.mock('./views/render', () => ({
  renderConfirmationView: jest.fn(() => 'RENDERED'),
}));

const sendRequest = {
  jsonrpc: '2.0',
  id: '1',
  method: ClientRequestMethod.ConfirmSend,
  params: {
    scope: KnownCaip2ChainId.Mainnet,
    fromAccountId: 'account-id',
    toAddress: 'GDTF7ERUQVTX23ZD6NY5XRYC5IQAKWFVTQ6IXSMEZWGVNDDGPYCVHRZP',
    amount: '1',
    assetId: 'stellar:pubnet/native',
  },
} as unknown as ConfirmSendJsonRpcRequest;

const preferences = {
  locale: 'en',
  currency: 'usd',
  hideBalances: false,
  useSecurityAlerts: true,
  simulateOnChainActions: true,
  useTokenDetection: true,
  batchCheckBalances: true,
  displayNftMedia: true,
  useNftDetection: true,
  useExternalPricingData: true,
  showTestnets: true,
};

const allEnabledKeys = [
  ConfirmationContextRefresherKey.Prices,
  ConfirmationContextRefresherKey.Scan,
  ConfirmationContextRefresherKey.Transaction,
];

describe('ConfirmationUXController', () => {
  const controller = new ConfirmationUXController();
  let scheduleSpy: jest.SpiedFunction<
    typeof RefreshConfirmationContextHandler.scheduleBackgroundEvent
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createInterface).mockResolvedValue('interface-id');
    jest.mocked(showDialog).mockResolvedValue(true);
    jest.mocked(updateInterfaceIfExists).mockResolvedValue(true);
    jest.mocked(getPreferences).mockResolvedValue(preferences);
    jest.mocked(renderConfirmationView).mockReturnValue(
      'RENDERED' as unknown as ReturnType<typeof renderConfirmationView>,
    );
    scheduleSpy = jest
      .spyOn(RefreshConfirmationContextHandler, 'scheduleBackgroundEvent')
      .mockResolvedValue('open-event-id');
  });

  afterEach(() => {
    scheduleSpy.mockRestore();
  });

  it('throws when transaction scanning is enabled without a security scan request', async () => {
    await expect(
      controller.renderConfirmationDialog({
        scope: KnownCaip2ChainId.Mainnet,
        interfaceKey: ConfirmationInterfaceKey.SignTransaction,
        fee: '100',
        renderContext: {},
        renderOptions: { securityScanning: true },
      }),
    ).rejects.toThrow(
      'Cannot scan a transaction confirmation without a security scan request.',
    );
  });

  it('persists enabled keys on the first context write and schedules them', async () => {
    await controller.renderConfirmationDialog({
      scope: KnownCaip2ChainId.Mainnet,
      interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
      fee: '100',
      renderContext: {},
      renderOptions: {
        loadPrice: true,
        securityScanning: true,
        localSimulation: true,
      },
      securityScanRequest: {
        accountAddress: 'GABC',
        transaction: 'xdr',
      },
      transactionValidationRequest: {
        accountId: 'account-id',
        transaction: 'xdr',
        request: sendRequest,
      },
    });

    expect(createInterface).toHaveBeenCalledWith('RENDERED', {});
    expect(updateInterfaceIfExists).toHaveBeenNthCalledWith(
      1,
      'interface-id',
      'RENDERED',
      expect.objectContaining({ enabledRefresherKeys: allEnabledKeys }),
    );
    expect(scheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceId: 'interface-id',
        refresherKeys: allEnabledKeys,
      }),
      expect.anything(),
    );
    expect(updateInterfaceIfExists).toHaveBeenNthCalledWith(
      2,
      'interface-id',
      'RENDERED',
      expect.objectContaining({
        enabledRefresherKeys: allEnabledKeys,
        backgroundEventId: 'open-event-id',
      }),
    );
  });

  it('omits Error slices from the open cron while persisting them as enabled', async () => {
    await controller.renderConfirmationDialog({
      scope: KnownCaip2ChainId.Mainnet,
      interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
      fee: '100',
      renderContext: {
        scanFetchStatus: FetchStatus.Error,
        transactionsFetchStatus: FetchStatus.Error,
      },
      renderOptions: {
        loadPrice: true,
        securityScanning: true,
        localSimulation: true,
      },
      securityScanRequest: {
        accountAddress: 'GABC',
        transaction: 'xdr',
      },
      transactionValidationRequest: {
        accountId: 'account-id',
        transaction: 'xdr',
        request: sendRequest,
      },
    });

    expect(updateInterfaceIfExists).toHaveBeenNthCalledWith(
      1,
      'interface-id',
      'RENDERED',
      expect.objectContaining({ enabledRefresherKeys: allEnabledKeys }),
    );
    expect(scheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        refresherKeys: [ConfirmationContextRefresherKey.Prices],
      }),
      expect.anything(),
    );
  });
});
