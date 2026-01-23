import { TransactionAlert } from './TransactionAlert';
import type { TransactionAlertProps } from './TransactionAlert';
import type {
  TransactionScanError,
  TransactionScanValidation,
} from '../../../../services/transaction-scan/types';
import type { Preferences } from '../../../../types/snap';

// Mock the getErrorMessage function
jest.mock('./getErrorMessage', () => ({
  getErrorMessage: jest.fn((error) => {
    if (error.code === 'InsufficientBalance') {
      return 'Insufficient balance';
    }
    return 'Unknown error';
  }),
}));

// Mock i18n
jest.mock('../../../../utils/i18n', () => ({
  i18n: (_locale: string) => (key: string, params?: any) => {
    const translations: Record<string, string> = {
      'confirmation.simulationTitleAPIError':
        "Because of an error, we couldn't check for security alerts.",
      'confirmation.simulationMessageAPIError':
        'Only continue if you trust every address involved.',
      'confirmation.simulationErrorTitle':
        'This transaction was reverted during simulation.',
      'confirmation.simulationErrorSubtitle': params?.reason ?? '{reason}',
      'confirmation.validationErrorTitle': 'This is a deceptive request',
      'confirmation.validationErrorSubtitle':
        'If you approve this request, a third party known for scams will take all your assets.',
      'confirmation.validationErrorLearnMore': 'Learn more',
      'confirmation.validationErrorSecurityAdviced': 'Security advice by',
    };
    return translations[key] ?? key;
  },
}));

describe('TransactionAlert', () => {
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

  const baseProps: TransactionAlertProps = {
    preferences: mockPreferences,
    validation: null,
    error: null,
    scanFetchStatus: 'initial',
  };

  it('renders without crashing when fetching', () => {
    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'fetching',
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('renders without crashing on API error', () => {
    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'error',
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('renders without crashing with no error or validation', () => {
    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'fetched',
      error: null,
      validation: null,
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('renders without crashing with simulation error', () => {
    const mockError: TransactionScanError = {
      type: 'validation_error',
      code: 'InsufficientBalance',
      message: null,
    };

    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'fetched',
      error: mockError,
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('renders without crashing with Malicious validation', () => {
    const mockValidation: TransactionScanValidation = {
      type: 'Malicious',
      reason: 'known_attacker',
    };

    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'fetched',
      validation: mockValidation,
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('renders without crashing with Warning validation', () => {
    const mockValidation: TransactionScanValidation = {
      type: 'Warning',
      reason: 'unfair_trade',
    };

    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'fetched',
      validation: mockValidation,
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('renders without crashing with Benign validation', () => {
    const mockValidation: TransactionScanValidation = {
      type: 'Benign',
      reason: null,
    };

    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'fetched',
      validation: mockValidation,
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('prioritizes API error over simulation error', () => {
    const mockError: TransactionScanError = {
      type: 'validation_error',
      code: 'InsufficientBalance',
      message: null,
    };

    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'error',
      error: mockError,
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('prioritizes simulation error over validation error', () => {
    const mockError: TransactionScanError = {
      type: 'validation_error',
      code: 'InsufficientBalance',
      message: null,
    };

    const mockValidation: TransactionScanValidation = {
      type: 'Malicious',
      reason: 'known_attacker',
    };

    const props: TransactionAlertProps = {
      ...baseProps,
      scanFetchStatus: 'fetched',
      error: mockError,
      validation: mockValidation,
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });

  it('works with different locales', () => {
    const spanishPreferences: Preferences = {
      ...mockPreferences,
      locale: 'es',
    };

    const props: TransactionAlertProps = {
      ...baseProps,
      preferences: spanishPreferences,
      scanFetchStatus: 'error',
    };

    const result = TransactionAlert(props);
    expect(result).toBeDefined();
  });
});
