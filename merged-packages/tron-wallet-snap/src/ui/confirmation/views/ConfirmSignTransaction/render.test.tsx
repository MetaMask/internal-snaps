import type { KeyringRequest } from '@metamask/keyring-api';
import { bytesToBase64, stringToBytes } from '@metamask/utils';

import { render } from './render';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import type { TronKeyringAccount } from '../../../../entities';
import { TronMultichainMethod } from '../../../../handlers/keyring-types';
import type { TransactionScanService } from '../../../../services/transaction-scan/TransactionScanService';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import type { Preferences } from '../../../../types/snap';

// Mock the context module
jest.mock('../../../../context', () => ({
  __esModule: true, // eslint-disable-line @typescript-eslint/naming-convention
  default: {
    snapClient: null,
    transactionScanService: null,
    state: null,
  },
}));

/**
 * Helper function to convert string to base64.
 *
 * @param str - The string to convert.
 * @returns Base64 encoded string.
 */
function toBase64(str: string): string {
  return bytesToBase64(stringToBytes(str));
}

describe('ConfirmSignTransaction render', () => {
  const mockAccount: TronKeyringAccount = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    options: {},
    methods: [
      TronMultichainMethod.SignMessage,
      TronMultichainMethod.SignTransaction,
    ],
    type: 'tron:eoa',
    scopes: [Network.Mainnet, Network.Shasta],
    entropySource: 'entropy-source-1' as any,
    derivationPath: "m/44'/195'/0'/0/0",
    index: 0,
  };

  const mockPreferences: Preferences = {
    locale: 'en',
    currency: 'usd',
    hideBalances: false,
    useSecurityAlerts: true,
    useExternalPricingData: true,
    simulateOnChainActions: true,
    useTokenDetection: true,
    batchCheckBalances: true,
    displayNftMedia: true,
    useNftDetection: true,
  };

  const mockScanResult: TransactionScanResult = {
    status: 'SUCCESS',
    estimatedChanges: {
      assets: [
        {
          type: 'out',
          value: 100,
          price: 0.1,
          symbol: 'TRX',
          name: 'Tron',
          logo: null,
          imageSvg: null,
          assetType: 'TRC20',
        },
      ],
    },
    validation: {
      type: 'Benign',
      reason: null,
    },
    error: null,
  };

  let mockSnapClient: jest.Mocked<SnapClient>;
  let mockTransactionScanService: jest.Mocked<TransactionScanService>;

  beforeEach(() => {
    mockSnapClient = {
      createInterface: jest.fn().mockResolvedValue('interface-id-123'),
      showDialog: jest.fn().mockResolvedValue(true),
      updateInterface: jest.fn().mockResolvedValue(undefined),
      getPreferences: jest.fn().mockResolvedValue(mockPreferences),
      scheduleBackgroundEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockTransactionScanService = {
      scanTransaction: jest.fn().mockResolvedValue(mockScanResult),
      getSecurityAlertDescription: jest.fn().mockReturnValue('description'),
    } as any;

    const mockState = {
      setKey: jest.fn().mockResolvedValue(undefined),
      getKey: jest.fn().mockResolvedValue({}),
    } as any;

    const mockAssetsService = {
      getAssetsByAccountId: jest.fn().mockResolvedValue([
        { rawAmount: '1000000' }, // bandwidth
        { rawAmount: '50000' }, // energy
      ]),
    } as any;

    const mockFeeCalculatorService = {
      computeFee: jest.fn().mockResolvedValue([]),
    } as any;

    const mockTronWebFactory = {
      createClient: jest.fn().mockReturnValue({
        utils: {
          crypto: {
            getTransactionID: jest.fn().mockReturnValue('mock-tx-id'),
          },
        },
      }),
    } as any;

    // Update mocked context with our mocks
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-restricted-globals
    const snapContext = require('../../../../context').default;
    snapContext.snapClient = mockSnapClient;
    snapContext.transactionScanService = mockTransactionScanService;
    snapContext.state = mockState;
    snapContext.assetsService = mockAssetsService;
    snapContext.feeCalculatorService = mockFeeCalculatorService;
    snapContext.tronWebFactory = mockTronWebFactory;
  });

  it('renders the confirmation dialog with security scan', async () => {
    const testOrigin = 'https://example.com';
    const testTransaction = toBase64('mock-transaction-data');

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000001',
      origin: testOrigin,
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignTransaction,
        params: {
          address: mockAccount.address,
          transaction: {
            rawDataHex: testTransaction,
            type: 'TransferContract',
          },
        },
      },
    };

    // Mock raw data with contract information
    const mockRawData = {
      contract: [
        {
          parameter: {
            value: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              owner_address: '41A2155E688B2BAEBDFDACD073BA79F5B22946AACF',
              // eslint-disable-next-line @typescript-eslint/naming-convention
              to_address: '4132F9C0C487F21716B7A8F12906B752889902655',
              // eslint-disable-next-line @typescript-eslint/naming-convention
              call_value: 100000,
            },
          },
        },
      ],
    };

    await render(request, mockAccount, mockRawData as any);

    // Verify createInterface was called
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);

    // Verify showDialog was called with the interface ID
    expect(mockSnapClient.showDialog).toHaveBeenCalledWith('interface-id-123');

    // Verify security scan was triggered with from/to addresses and value
    expect(mockTransactionScanService.scanTransaction).toHaveBeenCalledWith({
      accountAddress: mockAccount.address,
      parameters: {
        from: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
        to: '6wjzKJfLvipffZfji1fGwz4hbhwZrTgF5',
        data: undefined,
        value: undefined,
      },
      origin: testOrigin,
      scope: Network.Mainnet,
      options: ['simulation', 'validation'],
    });

    // Verify interface was updated with scan results
    expect(mockSnapClient.updateInterface).toHaveBeenCalled();
  });

  it('handles missing transaction scan service gracefully', async () => {
    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000002',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignTransaction,
        params: {
          address: mockAccount.address,
          transaction: {
            rawDataHex: toBase64('transaction'),
            type: 'TransferContract',
          },
        },
      },
    };

    const mockRawData = {
      contract: [],
    };

    // Set transactionScanService to null for this test
    // eslint-disable-next-line no-restricted-globals, @typescript-eslint/no-require-imports
    const snapContext = require('../../../../context').default;
    snapContext.transactionScanService = null;

    await render(request, mockAccount, mockRawData as any);

    // Should still create interface
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);

    // Should update interface without scan
    expect(mockSnapClient.updateInterface).toHaveBeenCalled();
  });

  it('handles security scan failure gracefully', async () => {
    mockTransactionScanService.scanTransaction.mockRejectedValue(
      new Error('Scan failed'),
    );

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000003',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignTransaction,
        params: {
          address: mockAccount.address,
          transaction: {
            rawDataHex: toBase64('transaction'),
            type: 'TransferContract',
          },
        },
      },
    };

    const mockRawData = {
      contract: [],
    };

    await render(request, mockAccount, mockRawData as any);

    // Should still render with error state
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
    expect(mockSnapClient.updateInterface).toHaveBeenCalled();
  });

  it('skips security scan when preferences disable it', async () => {
    mockSnapClient.getPreferences.mockResolvedValue({
      ...mockPreferences,
      useSecurityAlerts: false,
      simulateOnChainActions: false,
    });

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000004',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignTransaction,
        params: {
          address: mockAccount.address,
          transaction: {
            rawDataHex: toBase64('transaction'),
            type: 'TransferContract',
          },
        },
      },
    };

    const mockRawData = {
      contract: [],
    };

    await render(request, mockAccount, mockRawData as any);

    // Security scan should not be called
    expect(mockTransactionScanService.scanTransaction).not.toHaveBeenCalled();
  });

  it('uses fallback locale when preferences fail to load', async () => {
    mockSnapClient.getPreferences.mockRejectedValue(
      new Error('Failed to load'),
    );

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000005',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignTransaction,
        params: {
          address: mockAccount.address,
          transaction: {
            rawDataHex: toBase64('transaction'),
            type: 'TransferContract',
          },
        },
      },
    };

    const mockRawData = {
      contract: [],
    };

    // Should not throw, even with failed preferences
    expect(await render(request, mockAccount, mockRawData as any)).toBe(true);
  });

  it('handles missing origin gracefully', async () => {
    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000006',
      origin: undefined as any,
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignTransaction,
        params: {
          address: mockAccount.address,
          transaction: {
            rawDataHex: toBase64('transaction'),
            type: 'TransferContract',
          },
        },
      },
    };

    const mockRawData = {
      contract: [],
    };

    await render(request, mockAccount, mockRawData as any);

    // Should still work
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
  });

  it('returns the dialog promise result', async () => {
    const expectedResult = true;
    mockSnapClient.showDialog.mockResolvedValue(expectedResult);

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000007',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignTransaction,
        params: {
          address: mockAccount.address,
          transaction: {
            rawDataHex: toBase64('transaction'),
            type: 'TransferContract',
          },
        },
      },
    };

    const mockRawData = {
      contract: [],
    };

    const result = await render(request, mockAccount, mockRawData as any);

    expect(result).toBe(expectedResult);
  });
});
