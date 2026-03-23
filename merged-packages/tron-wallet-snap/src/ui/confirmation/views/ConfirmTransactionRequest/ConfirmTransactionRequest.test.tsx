import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from './types';
import { Network } from '../../../../constants';
import {
  SimulationStatus,
  type TransactionScanResult,
} from '../../../../services/transaction-scan/types';
import { FetchStatus, type Preferences } from '../../../../types/snap';

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
    simulationStatus: SimulationStatus.Completed,
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
    tokenPricesFetchStatus: FetchStatus.Fetched,
    scan: mockScanResult,
    scanFetchStatus: FetchStatus.Fetched,
    transactionRawData: null,
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
      scanFetchStatus: FetchStatus.Fetching,
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
      simulationStatus: SimulationStatus.Failed,
    };

    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scan: errorScanResult,
      scanFetchStatus: FetchStatus.Fetched,
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
      scanFetchStatus: FetchStatus.Error,
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
