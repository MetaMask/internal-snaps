import {
  DEFAULT_METAMASK_ORIGIN,
  requiresMaliciousAcknowledgement,
} from '@metamask/snap-networks-utils';
import type { Json } from '@metamask/utils';

import { KnownCaip2ChainId } from '../../api';
import { FieldType } from '../../services/transaction';
import type { ReadableOperationField } from '../../services/transaction';
import { TransactionScanValidationType } from '../../services/transaction-scan';
import type { TransactionScanResult } from '../../services/transaction-scan';
import {
  defaultPreferences as preferences,
  maliciousScan,
} from './__fixtures__/confirmation.fixtures';
import { ConfirmationInterfaceKey, FetchStatus } from './api';
import {
  buildResolveResult,
  ConfirmationBanner,
  getNetworkName,
  getParam,
  getInvocationDetailParams,
  getSecurityProperties,
  isFetchInProgress,
  formatOrigin,
  isLocalTransactionValidationFailed,
  isRemoteTransactionScanLoading,
  parseTransactionConfirmationResult,
  resolveConfirmationBanner,
  shouldDisableConfirmation,
} from './utils';

const warningScan = {
  ...maliciousScan,
  validation: {
    type: TransactionScanValidationType.Warning,
    reason: 'suspicious_request',
    description: null,
  },
};

const buildScan = (
  validation: TransactionScanResult['validation'],
  overrides: Partial<TransactionScanResult> = {},
): TransactionScanResult => ({
  status: 'SUCCESS',
  estimatedChanges: { assets: [] },
  validation,
  error: null,
  validationError: null,
  ...overrides,
});

const buildContext = (
  overrides: Record<string, Json> = {},
): Record<string, Json> => ({
  preferences: { useSecurityAlerts: true, simulateOnChainActions: true },
  scan: buildScan({ type: 'Benign', reason: null, description: null }),
  scanFetchStatus: FetchStatus.Fetched,
  securityScanning: true,
  remoteSimulation: false,
  ...overrides,
});

describe('confirmation utils', () => {
  describe('getNetworkName', () => {
    it.each([
      {
        testcase: '"Stellar Mainnet" for mainnet',
        input: KnownCaip2ChainId.Mainnet,
        expected: 'Stellar Mainnet',
      },
      {
        testcase: '"Stellar Testnet" for testnet',
        input: KnownCaip2ChainId.Testnet,
        expected: 'Stellar Testnet',
      },
      {
        testcase: '"Unknown" for an unrecognized scope',
        input: 'stellar:unknown' as KnownCaip2ChainId,
        expected: 'Unknown',
      },
    ])('returns $testcase', ({ input, expected }) => {
      expect(getNetworkName(input)).toBe(expected);
    });
  });

  describe('isFetchInProgress', () => {
    it.each([FetchStatus.Initial, FetchStatus.Fetching])(
      'returns true for %s',
      (status) => {
        expect(isFetchInProgress(status)).toBe(true);
      },
    );

    it.each([FetchStatus.Fetched, FetchStatus.Error])(
      'returns false for %s',
      (status) => {
        expect(isFetchInProgress(status)).toBe(false);
      },
    );
  });

  describe('formatOrigin', () => {
    it.each([
      {
        testcase: '"Unknown" for an undefined origin',
        input: undefined,
        expected: 'Unknown',
      },
      {
        testcase: '"Unknown" for an empty origin',
        input: '',
        expected: 'Unknown',
      },
      {
        testcase: '"MetaMask" for the internal metamask origin',
        input: DEFAULT_METAMASK_ORIGIN,
        expected: 'MetaMask',
      },
      {
        testcase: '"WalletConnect" for the wallet-connect origin',
        input: 'wallet-connect',
        expected: 'WalletConnect',
      },
      {
        testcase: 'known origins case-insensitively for metamask',
        input: 'MetaMask',
        expected: 'MetaMask',
      },
      {
        testcase: 'known origins case-insensitively for wallet-connect',
        input: 'Wallet-Connect',
        expected: 'WalletConnect',
      },
      {
        testcase: 'the hostname for an https URL',
        input: 'https://example.com',
        expected: 'example.com',
      },
      {
        testcase: 'the hostname for an https URL with path and query',
        input: 'https://app.example.com/path?q=1',
        expected: 'app.example.com',
      },
      {
        testcase: 'the hostname for an http URL',
        input: 'http://example.com',
        expected: 'example.com',
      },
      {
        testcase: 'an empty string for a non-URL string',
        input: '1234abcd-channel-id',
        expected: '',
      },
      {
        testcase: 'an empty string for a non-http URL',
        input: 'ftp://example.com',
        expected: '',
      },
      {
        testcase: 'an empty string for an invalid value',
        input: 'not a url',
        expected: '',
      },
    ])('returns $expected for $testcase', ({ input, expected }) => {
      expect(formatOrigin(input)).toStrictEqual(expected);
    });
  });

  describe('isRemoteTransactionScanLoading', () => {
    it('disables confirm while scan is fetching', () => {
      expect(
        isRemoteTransactionScanLoading({
          scanFetchStatus: FetchStatus.Fetching,
        }),
      ).toBe(true);
    });

    it('does not disable confirm once the scan has fetched', () => {
      expect(
        isRemoteTransactionScanLoading({
          scanFetchStatus: FetchStatus.Fetched,
        }),
      ).toBe(false);
    });

    it('does not disable confirm when the scan fetch status is not fetching', () => {
      expect(
        isRemoteTransactionScanLoading({ scanFetchStatus: FetchStatus.Error }),
      ).toBe(false);
    });
  });

  describe('shouldDisableConfirmation', () => {
    it('blocks while the scan is fetching', () => {
      expect(
        shouldDisableConfirmation({ scanFetchStatus: FetchStatus.Fetching }),
      ).toBe(true);
    });

    it('blocks when re-validation reports an error', () => {
      expect(
        shouldDisableConfirmation({
          scanFetchStatus: FetchStatus.Fetched,
          transactionsFetchStatus: FetchStatus.Error,
        }),
      ).toBe(true);
    });

    it('does not block when scan is fetched and re-validation is clean', () => {
      expect(
        shouldDisableConfirmation({
          scanFetchStatus: FetchStatus.Fetched,
          transactionsFetchStatus: FetchStatus.Fetched,
        }),
      ).toBe(false);
    });

    it('does not block when both statuses are omitted', () => {
      expect(shouldDisableConfirmation({})).toBe(false);
    });
  });

  describe('requiresMaliciousAcknowledgement', () => {
    it('requires acknowledgement for a malicious result when security alerts are enabled', () => {
      expect(
        requiresMaliciousAcknowledgement(
          preferences.useSecurityAlerts,
          maliciousScan.validation?.type,
        ),
      ).toBe(true);
    });

    it('does not require acknowledgement when security alerts are disabled', () => {
      expect(
        requiresMaliciousAcknowledgement(false, maliciousScan.validation?.type),
      ).toBe(false);
    });

    it('does not require acknowledgement for warning-level results', () => {
      expect(
        requiresMaliciousAcknowledgement(
          preferences.useSecurityAlerts,
          warningScan.validation?.type,
        ),
      ).toBe(false);
    });

    it('does not require acknowledgement when there is no scan result', () => {
      expect(
        requiresMaliciousAcknowledgement(preferences.useSecurityAlerts, null),
      ).toBe(false);
    });
  });

  describe('isLocalTransactionValidationFailed', () => {
    it('disables confirm when re-validation reports an error', () => {
      expect(isLocalTransactionValidationFailed(FetchStatus.Error)).toBe(true);
    });

    it('does not disable confirm while re-validation is fetching', () => {
      expect(isLocalTransactionValidationFailed(FetchStatus.Fetching)).toBe(
        false,
      );
    });

    it('does not disable confirm when re-validation has fetched', () => {
      expect(isLocalTransactionValidationFailed(FetchStatus.Fetched)).toBe(
        false,
      );
    });

    it('does not disable confirm when the status is undefined', () => {
      expect(isLocalTransactionValidationFailed(undefined)).toBe(false);
    });
  });

  describe('resolveConfirmationBanner', () => {
    it('prioritizes the validation banner when re-validation reports an error', () => {
      expect(
        resolveConfirmationBanner({
          preferences,
          transactionsFetchStatus: FetchStatus.Error,
        }),
      ).toBe(ConfirmationBanner.TransactionValidation);
    });

    it('prioritizes the validation banner even when scan is enabled', () => {
      expect(
        resolveConfirmationBanner({
          preferences: {
            ...preferences,
            useSecurityAlerts: true,
            simulateOnChainActions: true,
          },
          transactionsFetchStatus: FetchStatus.Error,
        }),
      ).toBe(ConfirmationBanner.TransactionValidation);
    });

    it('shows the scan banner when security alerts are enabled and there is no validation error', () => {
      expect(
        resolveConfirmationBanner({
          preferences: {
            ...preferences,
            useSecurityAlerts: true,
            simulateOnChainActions: false,
          },
          transactionsFetchStatus: FetchStatus.Fetched,
        }),
      ).toBe(ConfirmationBanner.TransactionScan);
    });

    it('shows the scan banner when simulation alerts are enabled', () => {
      expect(
        resolveConfirmationBanner({
          preferences: {
            ...preferences,
            useSecurityAlerts: false,
            simulateOnChainActions: true,
          },
          transactionsFetchStatus: FetchStatus.Initial,
        }),
      ).toBe(ConfirmationBanner.TransactionScan);
    });

    it('shows no banner when scan is disabled and there is no validation error', () => {
      expect(
        resolveConfirmationBanner({
          preferences: {
            ...preferences,
            useSecurityAlerts: false,
            simulateOnChainActions: false,
          },
          transactionsFetchStatus: FetchStatus.Fetched,
        }),
      ).toBe(ConfirmationBanner.None);
    });

    it('treats an undefined validation status as no validation error', () => {
      expect(
        resolveConfirmationBanner({
          preferences: {
            ...preferences,
            useSecurityAlerts: false,
            simulateOnChainActions: false,
          },
          transactionsFetchStatus: undefined,
        }),
      ).toBe(ConfirmationBanner.None);
    });
  });

  describe('getParam', () => {
    const params: ReadableOperationField[] = [
      { key: 'contractId', value: 'CABC123', type: FieldType.copyable },
      { key: 'functionName', value: 'transfer', type: FieldType.text },
      {
        key: 'arguments',
        value: ['GABC', '100'],
        type: FieldType.json,
      },
      { key: 'optional', value: null, type: FieldType.text },
    ];

    it('returns the value for a matching key', () => {
      expect(getParam(params, 'functionName')).toBe('transfer');
      expect(getParam(params, 'contractId')).toBe('CABC123');
    });

    it('returns json values unchanged', () => {
      expect(getParam(params, 'arguments')).toStrictEqual(['GABC', '100']);
    });

    it('returns null when the key is missing', () => {
      expect(getParam(params, 'authorizedAddress')).toBeNull();
    });

    it('returns null when the field value is null', () => {
      expect(getParam(params, 'optional')).toBeNull();
    });

    it('returns null for an empty params list', () => {
      expect(getParam([], 'functionName')).toBeNull();
    });
  });

  describe('getInvocationDetailParams', () => {
    it('drops header keys and keeps the rest in order', () => {
      expect(
        getInvocationDetailParams([
          {
            key: 'authorizedAddress',
            value: 'GABC',
            type: FieldType.copyable,
          },
          { key: 'contractId', value: 'CABC', type: FieldType.copyable },
          {
            key: 'functionName',
            value: 'createContract',
            type: FieldType.text,
          },
          { key: 'salt', value: 'aa', type: FieldType.copyable },
        ]),
      ).toStrictEqual([{ key: 'salt', value: 'aa', type: FieldType.copyable }]);
    });
  });

  describe('getSecurityProperties', () => {
    it('reports the verdict of a successful scan', () => {
      const context = buildContext({
        scan: buildScan({
          type: 'Malicious',
          reason: 'transfer_farming',
          description: 'Drains the account',
        }),
      });

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Malicious',
        securityAlertReason: 'transfer_farming',
        securityAlertDescription: 'Drains the account',
      });
    });

    it('omits the reason of a benign verdict', () => {
      expect(getSecurityProperties(buildContext())).toStrictEqual({
        securityAlertResponse: 'Benign',
      });
    });

    it('reports NotApplicable for a non-benign verdict without a reason', () => {
      const context = buildContext({
        scan: buildScan({ type: 'Warning', reason: null, description: null }),
      });

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Warning',
        securityAlertReason: 'NotApplicable',
      });
    });

    it.each([FetchStatus.Fetching, FetchStatus.Initial])(
      'reports Loading while the first scan is %s',
      (scanFetchStatus) => {
        // A send seeds the first scan with local estimates and no verdict.
        const context = buildContext({
          scan: buildScan(null),
          scanFetchStatus,
        });

        expect(getSecurityProperties(context)).toStrictEqual({
          securityAlertResponse: 'Loading',
          securityAlertReason: 'validation_in_progress',
        });
      },
    );

    it('reports Loading while the first scan has no result yet', () => {
      const context = buildContext({
        scan: null,
        scanFetchStatus: FetchStatus.Fetching,
      });

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Loading',
        securityAlertReason: 'validation_in_progress',
      });
    });

    it('reports the stored verdict while a re-scan is in progress', () => {
      const context = buildContext({ scanFetchStatus: FetchStatus.Fetching });

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Benign',
      });
    });

    it('reports Error when the scan request failed', () => {
      const context = buildContext({
        scan: null,
        scanFetchStatus: FetchStatus.Error,
      });

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Error',
        securityAlertReason: 'Error',
      });
    });

    it('reports Error when the scan returned no verdict', () => {
      const context = buildContext({
        scan: buildScan(null, { status: 'ERROR' }),
      });

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Error',
        securityAlertReason: 'Error',
      });
    });

    it('reports Error when the scan is missing from the context', () => {
      const { scan: _scan, ...context } = buildContext();

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Error',
        securityAlertReason: 'Error',
      });
    });

    it('returns undefined when a failed transaction validation paused the scan', () => {
      // Send opened with a missing memo: the scan is paused, not failed.
      const context = buildContext({
        scan: buildScan(null),
        scanFetchStatus: FetchStatus.Error,
        transactionsFetchStatus: FetchStatus.Error,
      });

      expect(getSecurityProperties(context)).toBeUndefined();
    });

    it('reports the stored verdict when the transaction validation failed later', () => {
      const context = buildContext({
        scanFetchStatus: FetchStatus.Error,
        transactionsFetchStatus: FetchStatus.Error,
      });

      expect(getSecurityProperties(context)).toStrictEqual({
        securityAlertResponse: 'Benign',
      });
    });

    it('returns undefined when there is no context', () => {
      expect(getSecurityProperties(null)).toBeUndefined();
    });

    it('returns undefined when the dialog opened without a scan', () => {
      const {
        securityScanning: _securityScanning,
        remoteSimulation: _remoteSimulation,
        ...context
      } = buildContext();

      expect(getSecurityProperties(context)).toBeUndefined();
    });

    it('returns undefined when security alerts are disabled', () => {
      const context = buildContext({
        preferences: { useSecurityAlerts: false, simulateOnChainActions: true },
      });

      expect(getSecurityProperties(context)).toBeUndefined();
    });
  });

  describe('buildResolveResult', () => {
    it('passes on the decision and the security verdict', () => {
      expect(buildResolveResult(true, buildContext())).toStrictEqual({
        confirmed: true,
        securityProperties: { securityAlertResponse: 'Benign' },
      });
    });

    it('passes on the custom context of the caller', () => {
      expect(
        buildResolveResult(true, buildContext(), { memo: 'memo' }),
      ).toStrictEqual({
        confirmed: true,
        memo: 'memo',
        securityProperties: { securityAlertResponse: 'Benign' },
      });
    });

    it('never reads the memo from the interface context itself', () => {
      const context = buildContext({
        memo: 'memo',
        interfaceKey: ConfirmationInterfaceKey.ConfirmSendTransaction,
      });

      expect(buildResolveResult(true, context)).not.toHaveProperty('memo');
    });

    it('passes on nothing else of the context', () => {
      const context = buildContext({
        memo: 'memo',
        transaction: 'xdr',
        account: { id: 'a' },
      });
      const result = buildResolveResult(true, context, { memo: 'memo' });

      expect(Object.keys(result as object)).toStrictEqual([
        'confirmed',
        'securityProperties',
        'memo',
      ]);
    });

    it('lets the custom context take precedence over the decision and verdict', () => {
      const result = buildResolveResult(true, buildContext(), {
        confirmed: false,
        securityProperties: { securityAlertResponse: 'Malicious' },
      });

      expect(result).toStrictEqual({
        confirmed: false,
        securityProperties: { securityAlertResponse: 'Malicious' },
      });
    });

    it('leaves out the verdict when there is none to report', () => {
      expect(buildResolveResult(true, null)).toStrictEqual({
        confirmed: true,
      });
    });

    it('reports Loading when the dialog is resolved during the first scan', () => {
      const context = buildContext({
        scan: null,
        scanFetchStatus: FetchStatus.Fetching,
      });

      expect(buildResolveResult(false, context)).toStrictEqual({
        confirmed: false,
        securityProperties: {
          securityAlertResponse: 'Loading',
          securityAlertReason: 'validation_in_progress',
        },
      });
    });

    it('survives being parsed back', () => {
      expect(
        parseTransactionConfirmationResult(
          buildResolveResult(true, buildContext(), { memo: 'memo' }),
        ),
      ).toStrictEqual({
        confirmed: true,
        memo: 'memo',
        securityProperties: { securityAlertResponse: 'Benign' },
      });
    });
  });

  describe('parseTransactionConfirmationResult', () => {
    it('treats a bare true as a confirmation with nothing else', () => {
      expect(parseTransactionConfirmationResult(true)).toStrictEqual({
        confirmed: true,
      });
    });

    it.each([false, null, 'yes', 1, [true]])(
      'treats %s as a rejection with nothing else',
      (value) => {
        expect(parseTransactionConfirmationResult(value)).toStrictEqual({
          confirmed: false,
        });
      },
    );

    it('returns the memo and the security verdict the event resolved with', () => {
      const securityProperties = {
        securityAlertResponse: 'Malicious',
        securityAlertReason: 'known_attacker',
      };

      expect(
        parseTransactionConfirmationResult({
          confirmed: true,
          memo: '  memo  ',
          securityProperties,
        }),
      ).toStrictEqual({ confirmed: true, memo: 'memo', securityProperties });
    });

    it('returns the security verdict on a rejection', () => {
      const securityProperties = { securityAlertResponse: 'Benign' };

      expect(
        parseTransactionConfirmationResult({
          confirmed: false,
          securityProperties,
        }),
      ).toStrictEqual({ confirmed: false, securityProperties });
    });

    it('treats a truthy confirmed as a confirmation', () => {
      expect(
        parseTransactionConfirmationResult({ confirmed: 'true' }),
      ).toStrictEqual({ confirmed: true });
    });

    it.each([null, 1, '', '   '])('omits a memo of %j', (memo) => {
      expect(
        parseTransactionConfirmationResult({ confirmed: true, memo }),
      ).toStrictEqual({ confirmed: true });
    });

    it.each([null, 'Benign', 1, { securityAlertResponse: 'Unknown' }])(
      'omits security properties of %j',
      (securityProperties) => {
        expect(
          parseTransactionConfirmationResult({
            confirmed: true,
            securityProperties,
          }),
        ).toStrictEqual({ confirmed: true });
      },
    );

    it('ignores any other field, such as a whole context', () => {
      expect(
        parseTransactionConfirmationResult({
          confirmed: true,
          context: { memo: 'memo', scanFetchStatus: 'fetched' },
        }),
      ).toStrictEqual({ confirmed: true });
    });
  });
});
