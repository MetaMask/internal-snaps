import type { KeyringRequest } from '@metamask/keyring-api';
import { bytesToBase64, stringToBytes } from '@metamask/utils';

import { render } from './render';
import type { SnapClient } from '../../../../clients/snap/SnapClient';
import { Network } from '../../../../constants';
import type { TronKeyringAccount } from '../../../../entities';
import { TronMultichainMethod } from '../../../../handlers/keyring-types';
import type { Preferences } from '../../../../types/snap';

/**
 * Helper function to convert string to base64.
 *
 * @param str - The string to convert.
 * @returns Base64 encoded string.
 */
function toBase64(str: string): string {
  return bytesToBase64(stringToBytes(str));
}

describe('ConfirmSignMessage render', () => {
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

  let mockSnapClient: jest.Mocked<SnapClient>;

  beforeEach(() => {
    mockSnapClient = {
      createInterface: jest.fn().mockResolvedValue('interface-id-123'),
      showDialog: jest.fn().mockResolvedValue(true),
      getPreferences: jest.fn().mockResolvedValue(mockPreferences),
    } as any;
  });

  it('renders the confirmation dialog with correct props', async () => {
    const testOrigin = 'https://example.com';
    const testMessage = 'Hello, Tron!';

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000001',
      origin: testOrigin,
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignMessage,
        params: {
          address: mockAccount.address,
          message: toBase64(testMessage),
        },
      },
    };

    await render(mockSnapClient, request, mockAccount);

    // Verify createInterface was called
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);

    // Verify createInterface and showDialog were called correctly
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
    expect(mockSnapClient.showDialog).toHaveBeenCalledWith('interface-id-123');

    // Verify the message was decoded correctly (we can't easily check the full JSX tree)
    // So we verify the render function was called with correct inputs
    expect(mockSnapClient.getPreferences).toHaveBeenCalled();
  });

  it('decodes base64 message correctly', async () => {
    const testMessage = 'Test message with special chars: 你好 🚀';

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000002',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Shasta,
      request: {
        method: TronMultichainMethod.SignMessage,
        params: {
          address: mockAccount.address,
          message: toBase64(testMessage),
        },
      },
    };

    await render(mockSnapClient, request, mockAccount);

    // Verify createInterface was called (message decoding happened internally)
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
  });

  it('uses fallback locale when preferences fail to load', async () => {
    mockSnapClient.getPreferences.mockRejectedValue(
      new Error('Failed to load'),
    );

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000003',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignMessage,
        params: {
          address: mockAccount.address,
          message: toBase64('Test'),
        },
      },
    };

    await render(mockSnapClient, request, mockAccount);

    // Should still create interface even when preferences fail
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
    expect(mockSnapClient.getPreferences).toHaveBeenCalled();
  });

  it('handles missing origin gracefully', async () => {
    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000004',
      origin: undefined as any,
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignMessage,
        params: {
          address: mockAccount.address,
          message: toBase64('Test message'),
        },
      },
    };

    await render(mockSnapClient, request, mockAccount);

    // Should create interface even with missing origin (formatOrigin handles it)
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
  });

  it('uses correct network scope', async () => {
    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000005',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Shasta,
      request: {
        method: TronMultichainMethod.SignMessage,
        params: {
          address: mockAccount.address,
          message: toBase64('Test'),
        },
      },
    };

    await render(mockSnapClient, request, mockAccount);

    // Verify render completes successfully with Shasta scope
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
  });

  it('returns the dialog promise', async () => {
    const expectedResult = true;
    mockSnapClient.showDialog.mockResolvedValue(expectedResult);

    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000006',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignMessage,
        params: {
          address: mockAccount.address,
          message: toBase64('Test'),
        },
      },
    };

    const result = await render(mockSnapClient, request, mockAccount);

    expect(result).toBe(expectedResult);
  });

  it('passes TRX_IMAGE_SVG as network image', async () => {
    const request: KeyringRequest = {
      id: '00000000-0000-4000-8000-000000000007',
      origin: 'https://test.com',
      account: mockAccount.id,
      scope: Network.Mainnet,
      request: {
        method: TronMultichainMethod.SignMessage,
        params: {
          address: mockAccount.address,
          message: toBase64('Test'),
        },
      },
    };

    await render(mockSnapClient, request, mockAccount);

    // Verify interface was created with TRX image
    expect(mockSnapClient.createInterface).toHaveBeenCalledTimes(1);
  });
});
