import { SolMethod } from '@metamask/keyring-api';
import {
  DEFAULT_METAMASK_ORIGIN,
  serialize,
} from '@metamask/snap-networks-utils';
import { BigNumber } from 'bignumber.js';

import { Network } from '../../../../core/constants/solana';
import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import {
  getSecurityProperties,
  parseConfirmTransactionRequestDialogValue,
} from './securityProperties';
import type { ConfirmTransactionRequestContext } from './types';

const buildScan = (
  overrides: Partial<TransactionScanResult> = {},
): TransactionScanResult => ({
  status: 'SUCCESS',
  estimatedChanges: { assets: [] },
  validation: { type: 'Benign', reason: null },
  error: null,
  validationError: null,
  ...overrides,
});

const buildContext = (
  overrides: Partial<ConfirmTransactionRequestContext> = {},
): ConfirmTransactionRequestContext => ({
  method: SolMethod.SignAndSendTransaction,
  scope: Network.Mainnet,
  networkImage: null,
  account: null,
  accountDomain: null,
  destinationAddress: null,
  destinationDomain: null,
  transaction: '',
  scan: buildScan(),
  scanFetchStatus: 'fetched',
  feeEstimatedInSol: '0',
  feePayment: null,
  tokenPrices: {},
  tokenPricesFetchStatus: 'fetched',
  origin: DEFAULT_METAMASK_ORIGIN,
  acknowledgementScreen: false,
  acknowledged: false,
  preferences: {
    locale: 'en',
    currency: 'usd',
    useSecurityAlerts: true,
    simulateOnChainActions: true,
  } as ConfirmTransactionRequestContext['preferences'],
  advanced: { shown: false, instructions: [] },
  ...overrides,
});

describe('getSecurityProperties', () => {
  it('returns undefined when security alerts are disabled', () => {
    const context = buildContext({
      preferences: {
        locale: 'en',
        currency: 'usd',
        useSecurityAlerts: false,
        simulateOnChainActions: true,
      } as ConfirmTransactionRequestContext['preferences'],
    });

    expect(getSecurityProperties(context)).toBeUndefined();
  });

  it('returns undefined when security alerts are disabled and a scan is still running', () => {
    // A simulation-only scan can be running while security alerts are off.
    const context = buildContext({
      preferences: {
        locale: 'en',
        currency: 'usd',
        useSecurityAlerts: false,
        simulateOnChainActions: true,
      } as ConfirmTransactionRequestContext['preferences'],
      scan: null,
      scanFetchStatus: 'fetching',
    });

    expect(getSecurityProperties(context)).toBeUndefined();
  });

  it('reports the verdict of a dApp-originated transaction', () => {
    const context = buildContext({ origin: 'https://dapp.example' });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Benign',
    });
  });

  it('reports the verdict of a sign-only request', () => {
    const context = buildContext({ method: SolMethod.SignTransaction });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Benign',
    });
  });

  it('returns undefined when there is no context, as when the dialog was dismissed', () => {
    expect(getSecurityProperties(null)).toBeUndefined();
  });

  it('reports a benign verdict without a reason or description', () => {
    expect(getSecurityProperties(buildContext())).toStrictEqual({
      securityAlertResponse: 'Benign',
    });
  });

  it('reports a malicious verdict with its reason and the scan description', () => {
    const context = buildContext({
      scan: buildScan({
        validation: {
          type: 'Malicious',
          reason: 'known_attacker',
          description: 'Known attacker involved in the transaction',
        },
      }),
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Malicious',
      securityAlertReason: 'known_attacker',
      securityAlertDescription: 'Known attacker involved in the transaction',
    });
  });

  it('reports NotApplicable for a warning without a reason or description', () => {
    const context = buildContext({
      scan: buildScan({ validation: { type: 'Warning', reason: null } }),
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Warning',
      securityAlertReason: 'NotApplicable',
    });
  });

  it('reports an error when the scan failed', () => {
    const context = buildContext({
      scan: null,
      scanFetchStatus: 'error',
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
    });
  });

  it('reports Loading when the dialog was cancelled during the initial scan', () => {
    const context = buildContext({
      scan: null,
      scanFetchStatus: 'fetching',
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Loading',
      securityAlertReason: 'validation_in_progress',
    });
  });

  it('reports the stored verdict when a refresh failed', () => {
    const context = buildContext({
      scan: buildScan({ validation: { type: 'Benign', reason: null } }),
      scanFetchStatus: 'error',
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Benign',
    });
  });

  it('reports a malicious verdict even when the latest scan failed', () => {
    const context = buildContext({
      scan: buildScan({
        validation: {
          type: 'Malicious',
          reason: 'known_attacker',
          description: 'Known attacker involved in the transaction',
        },
      }),
      scanFetchStatus: 'error',
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Malicious',
      securityAlertReason: 'known_attacker',
      securityAlertDescription: 'Known attacker involved in the transaction',
    });
  });

  it('reports the verdict when a benign verdict comes with a validation error', () => {
    const context = buildContext({
      scan: buildScan({
        status: 'ERROR',
        validation: { type: 'Benign', reason: null },
        validationError: {
          type: 'response',
          code: null,
          message: 'Unexpected response',
        },
      }),
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Benign',
    });
  });

  it('reports an error without a description when the verdict is missing', () => {
    const context = buildContext({
      scan: buildScan({
        status: 'ERROR',
        validation: { type: null, reason: null },
        validationError: {
          type: 'validation',
          code: 'some_code',
          message: 'Validation failed',
        },
      }),
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
    });
  });

  it('reports an Error verdict with its reason and description when the validation failed', () => {
    const context = buildContext({
      scan: buildScan({
        status: 'ERROR',
        validation: {
          type: 'Error',
          reason: 'some_reason',
          description: 'Validation failed',
        },
        validationError: {
          type: 'validation',
          code: 'some_reason',
          message: 'Validation failed',
        },
      }),
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'some_reason',
      securityAlertDescription: 'Validation failed',
    });
  });

  it('reports a stored Error verdict with its reason when a refresh failed', () => {
    const context = buildContext({
      scan: buildScan({
        validation: { type: 'Error', reason: 'some_reason' },
      }),
      scanFetchStatus: 'error',
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'some_reason',
    });
  });

  it('reports a stored Error verdict with its reason when a refresh kept it', () => {
    const context = buildContext({
      scan: buildScan({
        validation: { type: 'Error', reason: 'some_reason' },
      }),
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'some_reason',
    });
  });

  it('does not report a simulation error as the security error', () => {
    const context = buildContext({
      scan: buildScan({
        validation: { type: null, reason: null },
        error: {
          type: 'simulation',
          code: null,
          message: 'Simulation failed',
        },
        validationError: null,
      }),
    });

    expect(getSecurityProperties(context)).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
    });
  });
});

describe('parseConfirmTransactionRequestDialogValue', () => {
  it.each([undefined, null, false, 'dialog-result'])(
    'reports a rejection with no context when the dialog resolves to %p',
    (value) => {
      expect(parseConfirmTransactionRequestDialogValue(value)).toStrictEqual({
        result: false,
        context: null,
      });
    },
  );

  it('only reads a boolean true as a confirmation', () => {
    expect(
      parseConfirmTransactionRequestDialogValue({
        result: 'true',
        context: null,
      }),
    ).toStrictEqual({ result: false, context: null });
  });

  it('restores the context it was created from', () => {
    const context = buildContext({
      scan: buildScan({
        validation: { type: 'Malicious', reason: 'known_attacker' },
      }),
    });

    expect(
      parseConfirmTransactionRequestDialogValue({
        result: true,
        context: serialize(context),
      }),
    ).toStrictEqual({ result: true, context });
  });

  it('restores bigint and BigNumber values in the context', () => {
    const context = buildContext({
      advanced: {
        shown: true,
        instructions: [
          {
            type: 'TokenTransfer',
            parsed: { data: { amount: 1000n, fee: new BigNumber('1.5') } },
          },
        ] as unknown as ConfirmTransactionRequestContext['advanced']['instructions'],
      },
    });

    expect(
      parseConfirmTransactionRequestDialogValue({
        result: true,
        context: serialize(context),
      }),
    ).toStrictEqual({ result: true, context });
  });

  it('drops undefined values, so they read back as missing keys', () => {
    const context = buildContext({
      advanced: {
        shown: true,
        instructions: [
          {
            type: 'TokenTransfer',
            parsed: { data: { amount: 1000n, memo: undefined } },
          },
        ] as unknown as ConfirmTransactionRequestContext['advanced']['instructions'],
      },
    });

    expect(
      parseConfirmTransactionRequestDialogValue({
        result: true,
        context: serialize(context),
      }),
    ).toStrictEqual({
      result: true,
      context: {
        ...context,
        advanced: {
          shown: true,
          instructions: [
            {
              type: 'TokenTransfer',
              parsed: { data: { amount: 1000n } },
            },
          ],
        },
      },
    });
  });

  it('has no context when the value carries none', () => {
    expect(
      parseConfirmTransactionRequestDialogValue({
        result: true,
        context: null,
      }),
    ).toStrictEqual({ result: true, context: null });
  });

  it('has no context when the value carries something other than an object', () => {
    expect(
      parseConfirmTransactionRequestDialogValue({
        result: true,
        context: 'not-a-context',
      }),
    ).toStrictEqual({ result: true, context: null });
  });
});
