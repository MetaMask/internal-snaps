import { is } from '@metamask/superstruct';

import type { SecurityScanOutcome } from './types';
import {
  deriveSecurityAlert,
  getSecurityAlertDescription,
  getTransactionSecurityProperties,
  requiresMaliciousAcknowledgement,
  TransactionSecurityPropertiesStruct,
} from './utils';

describe('getTransactionSecurityProperties', () => {
  const scanWith = (
    validation: SecurityScanOutcome['validation'],
    status = 'SUCCESS',
  ): SecurityScanOutcome => ({ status, validation });

  it('marks a scan in progress as loading', () => {
    expect(getTransactionSecurityProperties('Loading')).toStrictEqual({
      securityAlertResponse: 'Loading',
      securityAlertReason: 'validation_in_progress',
    });
  });

  it('reports an error when the scan request failed', () => {
    expect(getTransactionSecurityProperties(null)).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
    });
  });

  it.each(['Warning', 'Malicious', 'Error'] as const)(
    'reports the %s verdict from the scan with its reason',
    (type) => {
      expect(
        getTransactionSecurityProperties(
          scanWith({ type, reason: 'transfer_farming' }),
        ),
      ).toStrictEqual({
        securityAlertResponse: type,
        securityAlertReason: 'transfer_farming',
      });
    },
  );

  it('omits the reason for benign verdicts', () => {
    expect(
      getTransactionSecurityProperties(
        scanWith({ type: 'Benign', reason: 'honeypot' }),
      ),
    ).toStrictEqual({
      securityAlertResponse: 'Benign',
    });
  });

  it('includes the reason and description for warning verdicts', () => {
    expect(
      getTransactionSecurityProperties(
        scanWith({
          type: 'Warning',
          reason: 'other',
          description: 'Suspicious transfer',
        }),
      ),
    ).toStrictEqual({
      securityAlertResponse: 'Warning',
      securityAlertReason: 'other',
      securityAlertDescription: 'Suspicious transfer',
    });
  });

  it('uses NotApplicable for a non-benign verdict without a reason', () => {
    expect(
      getTransactionSecurityProperties(
        scanWith({ type: 'Malicious', reason: null }),
      ),
    ).toStrictEqual({
      securityAlertResponse: 'Malicious',
      securityAlertReason: 'NotApplicable',
    });
  });

  it('omits the description when the scan has none', () => {
    const properties = getTransactionSecurityProperties(
      scanWith({ type: 'Warning', reason: 'other', description: '' }),
    );

    expect(properties).not.toHaveProperty('securityAlertDescription');
  });

  it('reports an error when the scan returned an error status without a verdict', () => {
    expect(
      getTransactionSecurityProperties(
        scanWith({ type: null, reason: 'other' }, 'ERROR'),
      ),
    ).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
    });
  });

  it('describes an error status with the error message of the scan', () => {
    expect(
      getTransactionSecurityProperties({
        status: 'ERROR',
        validation: null,
        error: { message: 'Simulation failed' },
      }),
    ).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
      securityAlertDescription: 'Simulation failed',
    });
  });

  it('omits the description of an error status when the error has no message', () => {
    const properties = getTransactionSecurityProperties({
      status: 'ERROR',
      validation: null,
      error: { message: null },
    });

    expect(properties).not.toHaveProperty('securityAlertDescription');
  });

  it('reports an error when a successful scan has no verdict', () => {
    expect(
      getTransactionSecurityProperties(scanWith({ type: null, reason: null })),
    ).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
    });
  });

  it('reports an error when the verdict is not a known security response', () => {
    expect(
      getTransactionSecurityProperties(
        scanWith({ type: 'Unknown', reason: 'transfer_farming' }),
      ),
    ).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'Error',
    });
  });
});

describe('deriveSecurityAlert', () => {
  it('returns null for missing verdicts', () => {
    expect(deriveSecurityAlert(null)).toBeNull();
    expect(deriveSecurityAlert(undefined)).toBeNull();
  });

  it('returns null for benign verdicts', () => {
    expect(deriveSecurityAlert('Benign')).toBeNull();
  });

  it('returns null for error verdicts', () => {
    expect(deriveSecurityAlert('Error')).toBeNull();
  });

  it('returns reportable verdicts unchanged', () => {
    expect(deriveSecurityAlert('Warning')).toBe('Warning');
    expect(deriveSecurityAlert('Malicious')).toBe('Malicious');
  });
});

describe('getSecurityAlertDescription', () => {
  it('falls back to an unknown-reason description for missing reasons', () => {
    expect(getSecurityAlertDescription(null)).toBe(
      'Security alert: Unknown reason',
    );
    expect(getSecurityAlertDescription(undefined)).toBe(
      'Security alert: Unknown reason',
    );
  });

  it('uses the table description for known reasons', () => {
    expect(getSecurityAlertDescription('honeypot')).toBe(
      'Security alert: The account invests funds in a token that is part of an orchestrated honeypot scheme',
    );
  });

  it('echoes the raw reason for unknown reasons', () => {
    expect(getSecurityAlertDescription('mystery_reason')).toBe(
      'Security alert: mystery_reason',
    );
  });
});

describe('requiresMaliciousAcknowledgement', () => {
  it('requires acknowledgement for a malicious verdict', () => {
    expect(requiresMaliciousAcknowledgement(true, 'Malicious')).toBe(true);
  });

  it.each([false, null, undefined])(
    'does not require acknowledgement when security alerts are %s',
    (useSecurityAlerts) => {
      expect(
        requiresMaliciousAcknowledgement(useSecurityAlerts, 'Malicious'),
      ).toBe(false);
    },
  );

  it.each(['Warning', 'Benign', 'Error', null, undefined] as const)(
    'does not require acknowledgement for %s',
    (alert) => {
      expect(requiresMaliciousAcknowledgement(true, alert)).toBe(false);
    },
  );
});

describe('TransactionSecurityPropertiesStruct', () => {
  it('accepts an empty object, since every field is optional', () => {
    expect(is({}, TransactionSecurityPropertiesStruct)).toBe(true);
  });

  it('accepts every security verdict', () => {
    const verdicts = [
      'Benign',
      'Warning',
      'Malicious',
      'Error',
      'Loading',
      'NotApplicable',
    ];

    verdicts.forEach((securityAlertResponse) => {
      expect(
        is({ securityAlertResponse }, TransactionSecurityPropertiesStruct),
      ).toBe(true);
    });
  });

  it('accepts a reason and a description', () => {
    expect(
      is(
        {
          securityAlertResponse: 'Warning',
          securityAlertReason: 'validation_in_progress',
          securityAlertDescription: 'Known scam address',
        },
        TransactionSecurityPropertiesStruct,
      ),
    ).toBe(true);
  });

  it('rejects an unknown security verdict', () => {
    expect(
      is(
        { securityAlertResponse: 'Unknown' },
        TransactionSecurityPropertiesStruct,
      ),
    ).toBe(false);
  });

  it('rejects a reason that is not a string', () => {
    expect(
      is({ securityAlertReason: 1 }, TransactionSecurityPropertiesStruct),
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      is({ transactionType: 'send' }, TransactionSecurityPropertiesStruct),
    ).toBe(false);
  });
});
