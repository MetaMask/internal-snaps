import { DEFAULT_METAMASK_ORIGIN } from '@metamask/snap-networks-utils';

import { Network } from '../../../../constants';
import { TRANSACTION_TAPOS_EXPIRED } from '../../../../services/transaction-scan/isTransactionDeadlinePassedError';
import { SimulationStatus } from '../../../../services/transaction-scan/types';
import type { TransactionScanResult } from '../../../../services/transaction-scan/types';
import { FetchStatus } from '../../../../types/snap';
import type { Preferences } from '../../../../types/snap';
import { ConfirmTransactionRequest } from './ConfirmTransactionRequest';
import type { ConfirmTransactionRequestContext } from './types';

// Mock i18n
jest.mock('../../../../utils/i18n', () => ({
  i18n: (_locale: string) => (key: string) => key,
}));

// Mock getExplorerUrl
jest.mock('../../../../utils/getExplorerUrl', () => ({
  getExplorerUrl: (_scope: Network, _type: string, _address: string) =>
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
    origin: DEFAULT_METAMASK_ORIGIN,
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

  it.each([
    [FetchStatus.Loading, true],
    [FetchStatus.Fetching, false],
  ])(
    'sets loading banner visibility when the scan is %s',
    (scanFetchStatus, visible) => {
      const context: ConfirmTransactionRequestContext = {
        ...baseContext,
        scanFetchStatus,
        scan: null,
      };

      const serialized = JSON.stringify(ConfirmTransactionRequest({ context }));

      expect(
        serialized.includes('confirmation.securityScanInProgressTitle'),
      ).toBe(visible);
      expect(serialized.includes('"severity":"info"')).toBe(visible);
    },
  );

  it.each([
    ['Warning', 'confirmation.validationWarningTitle'],
    ['Malicious', 'confirmation.validationErrorTitle'],
  ] as const)(
    'preserves the %s presentation during background refresh',
    (type, title) => {
      const context: ConfirmTransactionRequestContext = {
        ...baseContext,
        scanFetchStatus: FetchStatus.Fetching,
        scan: { ...mockScanResult, validation: { type, reason: null } },
      };

      const serialized = JSON.stringify(ConfirmTransactionRequest({ context }));

      expect(serialized).not.toContain(
        'confirmation.securityScanInProgressTitle',
      );
      expect(serialized).not.toContain('"disabled":true');
      expect(serialized).toContain(title);
    },
  );

  it('renders no banner for a benign scan during background refresh', () => {
    const serialized = JSON.stringify(
      ConfirmTransactionRequest({
        context: { ...baseContext, scanFetchStatus: FetchStatus.Fetching },
      }),
    );

    expect(serialized).not.toContain('"type":"Banner"');
    expect(serialized).not.toContain('"disabled":true');
  });

  it('uses warning copy separately from malicious copy', () => {
    const serialized = JSON.stringify(
      ConfirmTransactionRequest({
        context: {
          ...baseContext,
          scan: {
            ...mockScanResult,
            validation: { type: 'Warning', reason: null },
          },
        },
      }),
    );

    expect(serialized).toContain('confirmation.validationWarningTitle');
    expect(serialized).toContain('confirmation.validationWarningSubtitle');
    expect(serialized).not.toContain('confirmation.validationErrorTitle');
    expect(serialized).toContain('"severity":"warning"');
    expect(serialized).not.toContain('"disabled":true');
  });

  it('renders the security alert banner for malicious validations', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scan: {
        ...mockScanResult,
        validation: { type: 'Malicious', reason: 'known_attacker' },
      },
    };

    const serialized = JSON.stringify(ConfirmTransactionRequest({ context }));

    expect(serialized).toContain('confirmation.validationErrorTitle');
    expect(serialized).toContain('"severity":"danger"');
  });

  it('renders without TransactionAlert when useSecurityAlerts is false', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scanFetchStatus: FetchStatus.Fetching,
      preferences: {
        ...mockPreferences,
        useSecurityAlerts: false,
      },
    };

    const serialized = JSON.stringify(ConfirmTransactionRequest({ context }));

    expect(serialized).not.toContain('"type":"Banner"');
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

  it('disables confirm button when scanFetchStatus is loading', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scanFetchStatus: FetchStatus.Loading,
      scan: null,
    };

    const result = ConfirmTransactionRequest({ context });
    const serialized = JSON.stringify(result);

    // The confirm button should have disabled=true
    expect(serialized).toContain('"disabled":true');
  });

  it.each([
    [FetchStatus.Fetched, 'confirmation.simulationErrorTitle'],
    [FetchStatus.Fetching, 'confirmation.simulationErrorTitle'],
    [FetchStatus.Error, 'confirmation.simulationTitleAPIError'],
  ])(
    'enables confirm after a remote simulation failure when the scan is %s',
    (scanFetchStatus, bannerTitle) => {
      const errorScanResult: TransactionScanResult = {
        ...mockScanResult,
        status: 'ERROR',
        simulationStatus: SimulationStatus.Failed,
        error: {
          type: 'Revert',
          code: 'INSUFFICIENT_BALANCE',
          message: 'Reverted: insufficient balance',
        },
      };

      const context: ConfirmTransactionRequestContext = {
        ...baseContext,
        scan: errorScanResult,
        scanFetchStatus,
      };

      const result = ConfirmTransactionRequest({ context });
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('"disabled":true');
      expect(serialized).toContain(bannerTitle);
    },
  );

  it.each([TRANSACTION_TAPOS_EXPIRED, 'MALFORMED_TRANSACTION'])(
    'shows an error banner and keeps confirm disabled for local validation failure %s with security alerts off',
    (type) => {
      const context: ConfirmTransactionRequestContext = {
        ...baseContext,
        preferences: { ...mockPreferences, useSecurityAlerts: false },
        scan: {
          ...mockScanResult,
          status: 'ERROR',
          simulationStatus: SimulationStatus.Failed,
          error: { type, code: null, message: null },
        },
      };

      const serialized = JSON.stringify(ConfirmTransactionRequest({ context }));

      expect(serialized).toContain('"disabled":true');
      expect(serialized).toContain('confirmation.simulationErrorTitle');
      expect(serialized).toContain('confirmation.simulationErrorSubtitle');
      expect(serialized).toContain('"severity":"warning"');
    },
  );

  it('enables confirm button when scan is successful', () => {
    const result = ConfirmTransactionRequest({ context: baseContext });
    const serialized = JSON.stringify(result);

    // The confirm button should NOT have disabled=true
    // When disabled is false/undefined, it shouldn't be in the serialized output
    // or it should be false
    expect(serialized).not.toContain('"disabled":true');
  });

  it('enables confirm button when scanFetchStatus is fetching', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      scanFetchStatus: FetchStatus.Fetching,
      scan: null,
    };

    const result = ConfirmTransactionRequest({ context });
    const serialized = JSON.stringify(result);

    // The confirm button should not have disabled=true
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

  it('renders the MetaMask label for the canonical origin', () => {
    const result = ConfirmTransactionRequest({ context: baseContext });
    const serialized = JSON.stringify(result);

    // The stored origin is the canonical lowercase one, but the user must see
    // the MetaMask label.
    expect(serialized).toContain('MetaMask');
    expect(serialized).not.toContain('"metamask"');
  });

  it('renders the hostname for a dApp origin', () => {
    const context: ConfirmTransactionRequestContext = {
      ...baseContext,
      origin: 'https://dapp.example.com',
    };

    const result = ConfirmTransactionRequest({ context });
    const serialized = JSON.stringify(result);

    expect(serialized).toContain('dapp.example.com');
    expect(serialized).not.toContain('https://dapp.example.com');
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
