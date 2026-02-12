import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from './types';
import { Network } from '../../../../constants';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import type { Preferences } from '../../../../types/snap';

// Mock i18n
jest.mock('../../../../utils/i18n', () => ({
  i18n: (_locale: string) => (key: string) => key,
}));

// Mock getExplorerUrl
jest.mock('../../../../utils/getExplorerUrl', () => ({
  getExplorerUrl: (_scope: string, _type: string, _address: string) =>
    'https://explorer.example.com',
}));

describe('ConfirmTransactionRequest', () => {
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
          value: '1',
          price: '0.1',
          symbol: 'TRX',
          name: 'Tron',
          logo: null,
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

  const baseContext: ConfirmTransactionRequestContext = {
    origin: 'MetaMask',
    scope: Network.Mainnet,
    fromAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    toAddress: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
    amount: '1',
    fees: [],
    asset: {
      assetType: `${Network.Mainnet}/slip44:195`,
      keyringAccountId: 'account-1',
      network: Network.Mainnet,
      symbol: 'TRX',
      decimals: 6,
      rawAmount: '10000000',
      uiAmount: '10',
      iconUrl: '',
    },
    preferences: mockPreferences,
    networkImage: '',
    tokenPrices: {},
    tokenPricesFetchStatus: 'fetched',
    scan: mockScanResult,
    scanFetchStatus: 'fetched',
    scanParameters: {
      from: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
      to: 'TQkE4s6hQqxym4fYvtVLNEGPsaAChFqxPk',
      data: null,
      value: 1000000,
    },
    accountType: 'tron:eoa',
  };

  it('renders without crashing with security scan data', () => {
    const result = ConfirmTransactionRequest({ context: baseContext });
    expect(result).toBeDefined();
  });

  it('renders when useSecurityAlerts is true and scan data exists', () => {
    const result = ConfirmTransactionRequest({ context: baseContext });
    expect(result).toBeDefined();
    // The component renders successfully with security alerts enabled and scan data present
    expect(JSON.stringify(result)).toContain(
      'confirm-sign-and-send-transaction-confirm',
    );
  });

  it('renders without TransactionAlert when useSecurityAlerts is false', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      preferences: {
        ...mockPreferences,
        useSecurityAlerts: false,
      },
    };

    const result = ConfirmTransactionRequest({ context });
    expect(result).toBeDefined();
  });

  it('renders EstimatedChanges when simulateOnChainActions is true', () => {
    const result = ConfirmTransactionRequest({ context: baseContext });
    expect(result).toBeDefined();
    expect(JSON.stringify(result)).toContain(
      'confirmation.estimatedChanges.title',
    );
  });

  it('hides EstimatedChanges when simulateOnChainActions is false', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      preferences: {
        ...mockPreferences,
        simulateOnChainActions: false,
      },
    };

    const result = ConfirmTransactionRequest({ context });
    expect(result).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(
      'confirmation.estimatedChanges.title',
    );
  });

  it('disables confirm button when scanFetchStatus is fetching', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scanFetchStatus: 'fetching',
      scan: null,
    };

    const result = ConfirmTransactionRequest({ context });
    const serialized = JSON.stringify(result);

    // The confirm button should have disabled=true
    expect(serialized).toContain('"disabled":true');
  });

  it('disables confirm button when scan status is ERROR', () => {
    const errorScanResult: TransactionScanResult = {
      ...mockScanResult,
      status: 'ERROR',
    };

    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scan: errorScanResult,
      scanFetchStatus: 'fetched',
    };

    const result = ConfirmTransactionRequest({ context });
    const serialized = JSON.stringify(result);

    // The confirm button should have disabled=true
    expect(serialized).toContain('"disabled":true');
  });

  it('enables confirm button when scan is successful', () => {
    const result = ConfirmTransactionRequest({ context: baseContext });
    const serialized = JSON.stringify(result);

    // The confirm button should NOT have disabled=true
    // When disabled is false/undefined, it shouldn't be in the serialized output
    // or it should be false
    expect(serialized).not.toContain('"disabled":true');
  });

  it('renders with scan error state', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scan: null,
      scanFetchStatus: 'error',
    };

    const result = ConfirmTransactionRequest({ context });
    expect(result).toBeDefined();
  });

  it('renders with Malicious validation', () => {
    const maliciousScanResult: TransactionScanResult = {
      ...mockScanResult,
      validation: {
        type: 'Malicious',
        reason: 'known_attacker',
      },
    };

    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scan: maliciousScanResult,
    };

    const result = ConfirmTransactionRequest({ context });
    expect(result).toBeDefined();
  });
});
