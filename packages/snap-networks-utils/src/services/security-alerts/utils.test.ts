import {
  deriveSecurityAlert,
  getSecurityAlertDescription,
  getTransactionSecurityProperties,
  requiresMaliciousAcknowledgement,
} from './utils';

describe('getTransactionSecurityProperties', () => {
  it('returns no fields when no response is stored', () => {
    expect(getTransactionSecurityProperties(null)).toStrictEqual({});
    expect(getTransactionSecurityProperties(undefined)).toStrictEqual({});
  });

  it('marks a scan in progress as loading', () => {
    expect(
      getTransactionSecurityProperties({ response: 'Loading' }),
    ).toStrictEqual({
      securityAlertResponse: 'Loading',
      securityAlertReason: 'NotApplicable',
    });
  });

  it('omits the reason for benign verdicts', () => {
    expect(
      getTransactionSecurityProperties({
        response: 'Benign',
        reason: 'honeypot',
      }),
    ).toStrictEqual({
      securityAlertResponse: 'Benign',
    });
  });

  it('includes the reason and description for warning verdicts', () => {
    expect(
      getTransactionSecurityProperties({
        response: 'Warning',
        reason: 'other',
        description: 'Suspicious transfer',
      }),
    ).toStrictEqual({
      securityAlertResponse: 'Warning',
      securityAlertReason: 'other',
      securityAlertDescription: 'Suspicious transfer',
    });
  });

  it('uses NotApplicable for a non-benign verdict without a reason', () => {
    expect(
      getTransactionSecurityProperties({
        response: 'Malicious',
        reason: null,
      }),
    ).toStrictEqual({
      securityAlertResponse: 'Malicious',
      securityAlertReason: 'NotApplicable',
    });
  });

  it('omits the description when the response has none', () => {
    const properties = getTransactionSecurityProperties({
      response: 'Warning',
      reason: 'other',
      description: '',
    });

    expect(properties).not.toHaveProperty('securityAlertDescription');
  });

  it('uses NotApplicable for an error verdict without a reason', () => {
    expect(
      getTransactionSecurityProperties({ response: 'Error' }),
    ).toStrictEqual({
      securityAlertResponse: 'Error',
      securityAlertReason: 'NotApplicable',
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
